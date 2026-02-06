// routes/regionSessionRequests.routes.js
const express = require("express");
const router = express.Router();

const RegionSessionRequest = require("../models/demandeRegion");
const requireAuth = require("../middlewares/auth");
const Session = require("../models/session");

const isValidDate = (d) => d instanceof Date && !Number.isNaN(d.getTime());

const norm = (s) =>
  (s ?? "")
    .toString()
    .normalize("NFC")
    .replace(/\u200f|\u200e/g, "")
    .trim();

const NATIONAL_LEVELS = new Set(["تمهيدية", "شارة خشبية"]);
const REGIONAL_LEVELS = new Set(["S1", "S2", "S3", "الدراسة الابتدائية"]);
const ALLOWED_LEVELS = new Set([...NATIONAL_LEVELS, ...REGIONAL_LEVELS]);

const ALL_BRANCHES = ["رواد", "جوالة", "دليلات", "كشافة", "مرشدات", "أشبال", "زهرات", "عصافير"];
const LEVEL_TITLE = {
  S1: "دراسة الاختصاص في التنشيط S1",
  S2: "دراسة الاختصاص في الاسعافات الاولية S2",
  S3: "دراسة الاختصاص في امن و سلامة المخيمات S3",
  "الدراسة الابتدائية": "الدراسة الابتدائية",
};

function buildSessionTitle(reqDoc, levels) {
  // NATIONAL => keep the request name (custom)
  const isNational = levels.some(l => NATIONAL_LEVELS.has(l));
  if (isNational) return reqDoc.name;

  // REGIONAL => always 1 level
  const lvl = levels[0];
  return LEVEL_TITLE[lvl] || reqDoc.name;
}


/* -------------------- CREATE REQUEST -------------------- */
/**
 * POST /api/region-session-requests
 * Body (national): { name, training_levels: ["تمهيدية","شارة خشبية"] (1 or 2), startDate, endDate, branche:[...] }
 * Body (regional): { name, training_levels: ["S1"], startDate, endDate, director_name, participants_count }
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const regionFromUser = norm(req.user?.region);

    if (!userId) return res.status(401).json({ error: "Non authentifié" });
    if (!regionFromUser) return res.status(400).json({ error: "User has no region set" });

    const {
      name,
      training_levels,
      startDate,
      endDate,
      // national:
      branche,
      // regional:
      director_name,
      participants_count,
    } = req.body || {};

    const nm = norm(name);
    if (!nm) return res.status(400).json({ error: "name is required" });

    const levels = Array.isArray(training_levels) ? training_levels.map(norm).filter(Boolean) : [];
    if (levels.length === 0) return res.status(400).json({ error: "training_levels is required" });

    for (const l of levels) {
      if (!ALLOWED_LEVELS.has(l)) return res.status(400).json({ error: `Invalid level: ${l}` });
    }

    if (!startDate || !endDate) return res.status(400).json({ error: "startDate and endDate are required" });
    const sd = new Date(startDate);
    const ed = new Date(endDate);
    if (!isValidDate(sd) || !isValidDate(ed)) return res.status(400).json({ error: "Invalid dates" });
    if (ed < sd) return res.status(400).json({ error: "endDate must be >= startDate" });

    const hasNational = levels.some((l) => NATIONAL_LEVELS.has(l));
    const hasRegional = levels.some((l) => REGIONAL_LEVELS.has(l));

    if (hasNational && hasRegional) {
      return res.status(400).json({ error: "Cannot mix national and regional levels in the same request" });
    }

    let payload = {
      region: regionFromUser,
      training_levels: levels,
      startDate: sd,
      endDate: ed,
      name: nm,
      status: "SUBMITTED",
      created_by_user_id: userId,
      generated_session_id: null,
    };

    if (hasNational) {
      // NATIONAL: require branche[]
      const b = Array.isArray(branche) ? branche.map(norm).filter(Boolean) : [];
      if (b.length === 0) return res.status(400).json({ error: "branche is required for national requests" });

      payload = {
        ...payload,
        branche: b,
        director_name: null,
        participants_count: null,
      };
    } else {
      // REGIONAL: exactly one level + director + participants
      if (levels.length !== 1) return res.status(400).json({ error: "Regional request must have exactly one level" });

      const director = norm(director_name);
      if (!director) return res.status(400).json({ error: "director_name is required for regional requests" });

      const n = Number(participants_count);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: "participants_count must be > 0" });

      payload = {
        ...payload,
        branche: [],
        director_name: director,
        participants_count: n,
      };
    }

    const doc = await RegionSessionRequest.create(payload);
    return res.status(201).json({ ok: true, request: doc });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "Duplicate request" });
    if (err?.name === "ValidationError") return res.status(400).json({ error: err.message });

    console.error("POST /api/region-session-requests error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* -------------------- LIST REQUESTS -------------------- */
/**
 * GET /api/region-session-requests
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const regionFromUser = norm(req.user?.region);
    const isAdmin = !!req.user?.isAdmin;
    const isModerator = !!req.user?.isModerator;
    const isNational = !!req.user?.isNational;

    const qStatus = norm(req.query?.status);
    const qRegion = norm(req.query?.region);

    const filter = {};
    if (qStatus) filter.status = qStatus;

    if (isAdmin || isModerator || isNational) {
      if (qRegion) filter.region = qRegion;
    } else {
      if (!regionFromUser) return res.status(400).json({ error: "User has no region set" });
      filter.region = regionFromUser;
    }

    const requests = await RegionSessionRequest.find(filter)
      .sort({ created_at: -1, createdAt: -1, _id: -1 })
      .lean();

    return res.status(200).json({ ok: true, requests });
  } catch (err) {
    console.error("GET /api/region-session-requests error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* -------------------- MODERATOR LIST (MUST BE BEFORE "/:id") -------------------- */
/**
 * GET /api/region-session-requests/moderator
 */
router.get("/moderator", requireAuth, async (req, res) => {
  try {
    if (!req.user?.isModerator && !req.user?.isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const docs = await RegionSessionRequest.find({})
      .sort({ created_at: -1, createdAt: -1, _id: -1 })
      .lean();

    return res.json({ ok: true, requests: docs });
  } catch (e) {
    console.error("GET /api/region-session-requests/moderator error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* -------------------- GET BY ID -------------------- */
/**
 * GET /api/region-session-requests/:id
 */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Missing id" });

    const regionFromUser = norm(req.user?.region);
    const isAdmin = !!req.user?.isAdmin;
    const isModerator = !!req.user?.isModerator;
    const isNational = !!req.user?.isNational;

    const doc = await RegionSessionRequest.findById(id).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });

    if (!(isAdmin || isModerator || isNational)) {
      if (!regionFromUser) return res.status(400).json({ error: "User has no region set" });
      if (norm(doc.region) !== regionFromUser) return res.status(403).json({ error: "Forbidden" });
    }

    return res.status(200).json({ ok: true, request: doc });
  } catch (err) {
    console.error("GET /api/region-session-requests/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* -------------------- DECISION -------------------- */
/**
 * PATCH /api/region-session-requests/:id/decision
 * Body: { decision: "APPROVED"|"REJECTED", inscriptionStartDate?, inscriptionEndDate? }
 *
 * Rules:
 * - Only moderator/admin/national
 * - If REJECTED => update request only
 * - If APPROVED => create Session + set generated_session_id
 * - For NATIONAL: require inscription dates from body AND require branche in request
 * - For REGIONAL: auto inscription dates:
 *    inscriptionStartDate = validation date + 1 day
 *    inscriptionEndDate = session.startDate - 7 days (but not before inscriptionStartDate)
 * - For REGIONAL: branche always ALL_BRANCHES
 */
router.patch("/:id/decision", requireAuth, async (req, res) => {
  try {
    const requestId = String(req.params.id || "").trim();

    if (!req.user?.isModerator && !req.user?.isAdmin && !req.user?.isNational) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const decision = norm(req.body?.decision);
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return res.status(400).json({ error: "decision must be APPROVED or REJECTED" });
    }

    const reqDoc = await RegionSessionRequest.findById(requestId);
    if (!reqDoc) return res.status(404).json({ error: "Request not found" });

    if (reqDoc.status !== "SUBMITTED") {
      return res.status(400).json({ error: "Only SUBMITTED requests can be decided" });
    }

    // normalize levels from DB
    const levels = Array.isArray(reqDoc.training_levels)
      ? reqDoc.training_levels.map(norm).filter(Boolean)
      : reqDoc.training_level
        ? [norm(reqDoc.training_level)]
        : [];
    const title = buildSessionTitle(reqDoc, levels);    

    const isNational = levels.some((l) => NATIONAL_LEVELS.has(l));
    const isRegional = levels.length === 1 && REGIONAL_LEVELS.has(levels[0]);

    if (!levels.length || (!isNational && !isRegional)) {
      return res.status(400).json({ error: "Invalid request levels" });
    }

    // REJECT
    if (decision === "REJECTED") {
      reqDoc.status = "REJECTED";
      await reqDoc.save();
      return res.status(200).json({ ok: true, request: reqDoc.toObject() });
    }

    // APPROVED — prevent double creation
    if (reqDoc.generated_session_id) {
      reqDoc.status = "APPROVED";
      await reqDoc.save();
      return res.status(200).json({ ok: true, request: reqDoc.toObject() });
    }

    // inscription dates
    let insStart;
    let insEnd;

    if (isNational) {
      const { inscriptionStartDate, inscriptionEndDate } = req.body || {};
      if (!inscriptionStartDate || !inscriptionEndDate) {
        return res.status(400).json({
          error: "inscriptionStartDate and inscriptionEndDate are required for NATIONAL approval",
        });
      }

      insStart = new Date(inscriptionStartDate);
      insEnd = new Date(inscriptionEndDate);
      if (!isValidDate(insStart) || !isValidDate(insEnd)) {
        return res.status(400).json({ error: "Invalid inscription dates" });
      }
      if (insEnd < insStart) {
        return res.status(400).json({ error: "inscriptionEndDate must be >= inscriptionStartDate" });
      }
    } else {
      // REGIONAL auto rules
      const now = new Date();
      insStart = new Date(now);
      insStart.setDate(insStart.getDate() + 1);

      const startDate = new Date(reqDoc.startDate);
      insEnd = new Date(startDate);
      insEnd.setDate(insEnd.getDate() - 7);

      if (!isValidDate(insStart) || !isValidDate(insEnd)) {
        return res.status(400).json({ error: "Invalid computed inscription dates" });
      }

      // guard: end cannot be before start
      if (insEnd < insStart) {
        insEnd = new Date(insStart);
      }
    }

    // branche (IMPORTANT FIX)
    let branche = [];

    if (isNational) {
      branche = Array.isArray(reqDoc.branche) ? reqDoc.branche.map(norm).filter(Boolean) : [];
      if (branche.length === 0) {
        // ✅ clear message instead of mongoose 500
        return res.status(400).json({ error: "branche is required for NATIONAL session creation" });
      }
    } else {
      branche = ALL_BRANCHES;
    }

    // Build Session payload (match your Session model fields)
    const sessionPayload = {
      title,
      startDate: reqDoc.startDate,
      endDate: reqDoc.endDate,

      organizer: norm(reqDoc.region),

      // ✅ keep for all sessions (national + regional)
      trainingLevels: levels,

      // ✅ your current Session schema expects "branche"
      branche,

      inscriptionStartDate: insStart,
      inscriptionEndDate: insEnd,
    };

    const session = await Session.create(sessionPayload);

    reqDoc.status = "APPROVED";
    reqDoc.generated_session_id = session._id;
    await reqDoc.save();

    return res.status(200).json({ ok: true, request: reqDoc.toObject(), session });
  } catch (err) {
    console.error("PATCH /api/region-session-requests/:id/decision error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* -------------------- INSCRIPTION DATES OVERRIDE (optional) -------------------- */
/**
 * PATCH /api/region-session-requests/:id/inscription-dates
 */
router.patch("/:id/inscription-dates", requireAuth, async (req, res) => {
  try {
    const requestId = String(req.params.id || "").trim();
    const userRegion = norm(req.user?.region);
    const isAdmin = !!req.user?.isAdmin;
    const isModerator = !!req.user?.isModerator;
    const isNational = !!req.user?.isNational;

    const { inscriptionStartDate, inscriptionEndDate } = req.body || {};
    if (!inscriptionStartDate || !inscriptionEndDate) {
      return res.status(400).json({ error: "inscriptionStartDate and inscriptionEndDate are required" });
    }

    const sd = new Date(inscriptionStartDate);
    const ed = new Date(inscriptionEndDate);
    if (!isValidDate(sd) || !isValidDate(ed)) return res.status(400).json({ error: "Invalid dates" });
    if (ed < sd) return res.status(400).json({ error: "inscriptionEndDate must be >= inscriptionStartDate" });

    const reqDoc = await RegionSessionRequest.findById(requestId).lean();
    if (!reqDoc) return res.status(404).json({ error: "Request not found" });

    const levels = Array.isArray(reqDoc.training_levels)
      ? reqDoc.training_levels.map(norm).filter(Boolean)
      : reqDoc.training_level
        ? [norm(reqDoc.training_level)]
        : [];

    const isRegionalTrack = levels.length === 1 && REGIONAL_LEVELS.has(levels[0]);
    if (!isRegionalTrack) {
      return res.status(400).json({ error: "This action is only allowed for S1/S2/S3/الدراسة الابتدائية requests" });
    }

    if (reqDoc.status !== "APPROVED") {
      return res.status(400).json({ error: "Request must be APPROVED" });
    }

    const sessionId = reqDoc.generated_session_id;
    if (!sessionId) return res.status(400).json({ error: "generated_session_id is missing on this request" });

    if (!(isAdmin || isModerator || isNational)) {
      if (!userRegion) return res.status(400).json({ error: "User has no region set" });
      if (norm(reqDoc.region) !== userRegion) return res.status(403).json({ error: "Forbidden" });
    }

    const updated = await Session.findByIdAndUpdate(
      sessionId,
      { inscriptionStartDate: sd, inscriptionEndDate: ed },
      { new: true }
    ).select("_id title inscriptionStartDate inscriptionEndDate");

    if (!updated) return res.status(404).json({ error: "Session not found for generated_session_id" });

    return res.status(200).json({ ok: true, session: updated });
  } catch (err) {
    console.error("PATCH /api/region-session-requests/:id/inscription-dates error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
