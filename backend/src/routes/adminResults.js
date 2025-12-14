// routes/adminResults.js
const express = require('express');
const mongoose = require('mongoose');
const { param, validationResult } = require('express-validator');

const requireAuth = require('../middlewares/auth');

const Session = require('../models/session');
const Formation = require('../models/formation');
const SessionAffectation = require('../models/affectation');
const FinalDecision = require('../models/finalDecision');
const Demande = require('../models/demande');
const SignatoryMandate = require('../models/signatoryMandate');

const router = express.Router();

function bad(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(400).json({ errors: e.array() });
  return null;
}

function toIso(d) {
  return d ? new Date(d).toISOString() : null;
}

function safeArr(a) {
  return Array.isArray(a) ? a : [];
}

function oid(x) {
  try {
    return typeof x === 'string' ? new mongoose.Types.ObjectId(x) : x;
  } catch {
    return x;
  }
}

function uniqStrings(arr) {
  const s = new Set((arr || []).filter(Boolean).map(String));
  return Array.from(s);
}

/** ============================================================
 * GET /api/admin/results/me-role
 * -> renvoie le type CN (cn_president / cn_commissioner) si mandat actif (endDate=null)
 * ============================================================ */
router.get('/me-role', requireAuth, async (req, res) => {
  try {
    const meId = (req.user && (req.user.id || req.user._id)) || null;
    if (!meId) return res.status(401).json({ role: null });

    const m = await SignatoryMandate.findOne({
      user: oid(meId),
      endDate: null,
      type: { $in: ['cn_president', 'cn_commissioner'] },
    })
      .select('type')
      .lean();

    // ✅ le front attend "role", mais la source est "type"
    return res.json({ role: m?.type || null });
  } catch (err) {
    console.error('GET /admin/results/me-role ERROR', err);
    return res.status(500).json({ role: null });
  }
});

/** ============================================================
 * Helpers
 * ============================================================ */

/**
 * Build map: branche -> Set(userId) depuis Demande
 * On s’en sert pour filtrer les formations mixtes.
 */
async function buildApplicantsByBranche(sessionId) {
  const agg = await Demande.aggregate([
    { $match: { session: oid(sessionId) } },
    {
      $group: {
        _id: '$branche',
        users: { $addToSet: '$applicant' }, // applicant doit être ObjectId(User)
      },
    },
  ]);

  const map = new Map();
  for (const r of agg) {
    const br = String(r._id || '—');
    const users = (r.users || []).filter(Boolean).map(String);
    map.set(br, new Set(users));
  }
  return map;
}

/**
 * Eligible users pour une formation selon ses branches.
 * Si branches vide -> on retourne null (= pas de filtre par branche).
 */
function eligibleUsersForFormation(formationBranches, applicantsByBranche) {
  const branches = safeArr(formationBranches).map(x => String(x || '—'));
  if (!branches.length) return null;

  const s = new Set();
  for (const br of branches) {
    const set = applicantsByBranche.get(br);
    if (set) for (const u of set) s.add(String(u));
  }
  return s; // Set<string> of userIds
}

/**
 * Stats d'une formation:
 * - participants distinct trainees affectés (filtrés branches si mixte)
 * - present distinct trainees affectés isPresent=true
 * - final decisions VALIDATED distinct (trainee) pour les présents
 * - breakdown decision success/retake/incompatible (distinct trainee)
 *
 * isValidated = presentDistinct > 0 && validatedDistinct == presentDistinct
 */
async function computeFormationStats({ sessionId, formation, eligibleSet }) {
  const formationId = oid(formation._id);

  const baseMatch = {
    formation: formationId,
    role: 'trainee',
  };

  const userIn = eligibleSet ? { $in: Array.from(eligibleSet).map(oid) } : null;

  // participants distinct
  const participantsAgg = await SessionAffectation.aggregate([
    { $match: { ...baseMatch, ...(userIn ? { user: userIn } : {}) } },
    { $group: { _id: '$user' } },
    { $count: 'n' },
  ]);
  const participants = participantsAgg?.[0]?.n ? Number(participantsAgg[0].n) : 0;

  // présents distinct (trainee) depuis affectations
  const presentAgg = await SessionAffectation.aggregate([
    {
      $match: {
        ...baseMatch,
        ...(userIn ? { user: userIn } : {}),
        isPresent: { $in: [true, 'true', 1, '1'] },
      },
    },
    { $group: { _id: '$user' } },
  ]);

  // IDs trainees présents (string)
  let presentUsers = (presentAgg || []).map(x => String(x._id)).filter(Boolean);

  // sécurité: si eligibleSet fourni, on intersectionne (au cas où)
  if (eligibleSet) {
    presentUsers = presentUsers.filter(u => eligibleSet.has(String(u)));
  }

  const present = presentUsers.length;

  // FinalDecision VALIDATED distinct trainee pour les présents
  // + répartition par decision (distinct trainee)
  let validatedDistinct = 0;
  let success = 0,
    retake = 0,
    incompatible = 0;

  if (presentUsers.length > 0) {
    const presentOids = presentUsers.map(oid);

    const fdAgg = await FinalDecision.aggregate([
      {
        $match: {
          session: oid(sessionId),
          formation: formationId,
          status: 'validated',
          trainee: { $in: presentOids },
        },
      },
      // 1) distinct trainee, conserver 1 decision (si doublons)
      {
        $group: {
          _id: '$trainee',
          decision: { $first: '$decision' },
        },
      },
      // 2) stats globales
      {
        $group: {
          _id: null,
          validatedDistinct: { $sum: 1 },
          success: {
            $sum: {
              $cond: [{ $eq: ['$decision', 'success'] }, 1, 0],
            },
          },
          retake: {
            $sum: {
              $cond: [{ $eq: ['$decision', 'retake'] }, 1, 0],
            },
          },
          incompatible: {
            $sum: {
              $cond: [{ $eq: ['$decision', 'incompatible'] }, 1, 0],
            },
          },
        },
      },
    ]);

    const row = fdAgg?.[0] || null;
    validatedDistinct = row ? Number(row.validatedDistinct || 0) : 0;
    success = row ? Number(row.success || 0) : 0;
    retake = row ? Number(row.retake || 0) : 0;
    incompatible = row ? Number(row.incompatible || 0) : 0;
  }

  const isValidated = present > 0 && validatedDistinct === present;

  return {
    participants,
    present,
    success,
    retake,
    incompatible,
    isValidated,
    // debug utile au besoin:
    // debug: { presentDistinct: present, validatedDistinct }
  };
}

/**
 * Session stats: construit niveaux -> branches -> formations
 * + totals + allFormationsValidated
 */
async function computeSessionStats(sessionId) {
  // 1) formations
  const formations = await Formation.find({ session: oid(sessionId) })
    .select('_id nom niveau branches centreTitleSnapshot centreRegionSnapshot')
    .lean();

  // 2) map branche -> Set(users) depuis Demande
  const applicantsByBranche = await buildApplicantsByBranche(sessionId);

  // 3) boucle formations => stats
  const formationRows = [];
  for (const f of formations) {
    const eligibleSet = eligibleUsersForFormation(f.branches, applicantsByBranche);

    const stats = await computeFormationStats({
      sessionId,
      formation: f,
      eligibleSet,
    });

    // branche d'affichage:
    const branches = safeArr(f.branches).map(x => String(x || '—'));
    const displayBranche =
      branches.length === 0 ? '—' : branches.length === 1 ? branches[0] : 'مختلطة';

    formationRows.push({
      formationId: String(f._id),
      nom: f.nom || '',
      niveau: String(f.niveau || '—'),
      branche: displayBranche,
      centreTitleSnapshot: f.centreTitleSnapshot || '',
      centreRegionSnapshot: f.centreRegionSnapshot || '',
      stats: {
        participants: stats.participants,
        present: stats.present,
        success: stats.success,
        retake: stats.retake,
        incompatible: stats.incompatible,
      },
      isValidated: !!stats.isValidated,
      // debug: stats.debug
    });
  }

  // 4) group niveau -> branche -> formations
  const byNiveau = new Map();

  function emptyTotals() {
    return { participants: 0, present: 0, success: 0, retake: 0, incompatible: 0 };
  }
  function add(a, b) {
    a.participants += Number(b.participants || 0);
    a.present += Number(b.present || 0);
    a.success += Number(b.success || 0);
    a.retake += Number(b.retake || 0);
    a.incompatible += Number(b.incompatible || 0);
  }

  const totals = emptyTotals();

  for (const row of formationRows) {
    add(totals, row.stats);

    if (!byNiveau.has(row.niveau)) {
      byNiveau.set(row.niveau, {
        niveau: row.niveau,
        subtotal: emptyTotals(),
        byBranche: new Map(),
      });
    }
    const nv = byNiveau.get(row.niveau);
    add(nv.subtotal, row.stats);

    const brKey = row.branche;
    if (!nv.byBranche.has(brKey)) {
      nv.byBranche.set(brKey, { branche: brKey, subtotal: emptyTotals(), formations: [] });
    }
    const br = nv.byBranche.get(brKey);
    add(br.subtotal, row.stats);
    br.formations.push(row);
  }

  const niveaux = Array.from(byNiveau.values())
    .map(nv => ({
      niveau: nv.niveau,
      subtotal: nv.subtotal,
      branches: Array.from(nv.byBranche.values()).sort((a, b) =>
        a.branche.localeCompare(b.branche, 'ar')
      ),
    }))
    .sort((a, b) => a.niveau.localeCompare(b.niveau, 'ar'));

  const allFormationsValidated =
    formationRows.length > 0 && formationRows.every(f => !!f.isValidated);

  return { totals, niveaux, allFormationsValidated };
}

/** ------------------------------
 * Signatory roles (CN) for connected user
 * - basé sur SignatoryMandate.type + endDate:null
 * ------------------------------ */
async function getMySignatoryRoles(meId) {
  if (!meId) return { canPresident: false, canCommissioner: false };

  const mandates = await SignatoryMandate.find({
    user: oid(meId),
    endDate: null,
    type: { $in: ['cn_president', 'cn_commissioner'] },
  })
    .select('type')
    .lean();

  const types = new Set((mandates || []).map(m => String(m.type)));
  return {
    canPresident: types.has('cn_president'),
    canCommissioner: types.has('cn_commissioner'),
  };
}

/** ============================================================
 * GET /api/admin/results/sessions
 * ============================================================ */
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const meId = (req.user && (req.user.id || req.user._id)) || null;

    const sessions = await Session.find({})
      .select('_id title startDate endDate isVisible validations organizer')
      .sort({ endDate: -1, startDate: -1 })
      .lean();

    const canValidate = await getMySignatoryRoles(meId); // ✅ une seule fois (mandat national)

    const payload = [];
    for (const s of sessions) {
      const stats = await computeSessionStats(s._id);

      payload.push({
        sessionId: String(s._id),
        title: s.title || '',
        organizer: s.organizer || '',
        startDate: toIso(s.startDate),
        endDate: toIso(s.endDate),
        isVisible: !!s.isVisible,
        validations: {
          commissioner: {
            isValidated: !!s?.validations?.commissioner?.isValidated,
            validatedAt: toIso(s?.validations?.commissioner?.validatedAt),
          },
          president: {
            isValidated: !!s?.validations?.president?.isValidated,
            validatedAt: toIso(s?.validations?.president?.validatedAt),
          },
        },
        canValidate, // (optionnel, mais on garde)
        totals: stats.totals,
        niveaux: stats.niveaux,
        allFormationsValidated: !!stats.allFormationsValidated,
      });
    }

    return res.json({ sessions: payload });
  } catch (err) {
    console.error('GET /admin/results/sessions ERROR', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});
/** ============================================================
 * POST /api/admin/results/sessions/:sessionId/validate
 * PROCESS STRICT :
 * - le cn_president valide TOUJOURS en premier
 * - le cn_commissioner valide seulement APRÈS le président
 * - quand les deux ont validé => isVisible = true
 * ============================================================ */
router.post(
  '/sessions/:sessionId/validate',
  requireAuth,
  [param('sessionId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;

    try {
      const { sessionId } = req.params;
      const meId = (req.user && (req.user.id || req.user._id)) || null;
      if (!meId) {
        return res.status(401).json({ message: 'Utilisateur non authentifié.' });
      }

      const session = await Session.findById(sessionId);
      if (!session) {
        return res.status(404).json({ message: 'Session introuvable.' });
      }

      const roles = await getMySignatoryRoles(meId);

      // sécurité
      session.validations = session.validations || {};
      session.validations.president = session.validations.president || {};
      session.validations.commissioner = session.validations.commissioner || {};

      const now = new Date();

      const presidentValidated = !!session.validations.president.isValidated;
      const commissionerValidated = !!session.validations.commissioner.isValidated;

      /* ================================
       * 1️⃣ CAS PRÉSIDENT
       * ================================ */
      if (roles.canPresident) {
        if (presidentValidated) {
          return res.status(403).json({
            message: 'Le président a déjà validé cette session.',
          });
        }

        session.validations.president.isValidated = true;
        session.validations.president.validatedBy = meId;
        session.validations.president.validatedAt = now;

        await session.save();

        return res.json({
          ok: true,
          step: 'president_validated',
          session: {
            sessionId: String(session._id),
            validations: session.validations,
            isVisible: !!session.isVisible,
          },
        });
      }

      /* ================================
       * 2️⃣ CAS COMMISSAIRE
       * ================================ */
      if (roles.canCommissioner) {
        if (!presidentValidated) {
          return res.status(403).json({
            message: 'Le président doit valider la session avant le commissaire.',
          });
        }

        if (commissionerValidated) {
          return res.status(403).json({
            message: 'Le commissaire a déjà validé cette session.',
          });
        }

        session.validations.commissioner.isValidated = true;
        session.validations.commissioner.validatedBy = meId;
        session.validations.commissioner.validatedAt = now;

        // les deux validations sont présentes → visibilité
        session.isVisible = true;

        await session.save();

        return res.json({
          ok: true,
          step: 'commissioner_validated',
          session: {
            sessionId: String(session._id),
            validations: session.validations,
            isVisible: true,
          },
        });
      }

      /* ================================
       * 3️⃣ AUCUN DROIT
       * ================================ */
      return res.status(403).json({
        message: "Vous n'êtes pas autorisé à valider cette session.",
      });
    } catch (err) {
      console.error('POST /admin/results/sessions/:sessionId/validate ERROR', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

module.exports = router;
