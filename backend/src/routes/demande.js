// routes/demandes.js (training) — FULL FILE (copy/paste)

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const Demande = require('../models/demande');
const Session = require('../models/session');
const SessionAffectation = require('../models/affectation');
const User = require('../models/user');
const requireAuth = require('../middlewares/auth');

const router = express.Router();
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const ALLOWED_LEVELS = new Set(['تمهيدية', 'شارة خشبية', 'S1', 'S2', 'S3', 'الدراسة الابتدائية']);
const ALLOWED_BRANCH = new Set(['رواد', 'جوالة', 'دليلات', 'كشافة', 'مرشدات', 'أشبال', 'زهرات', 'عصافير']);

/* ====================== helpers e-training ======================= */
function buildServiceToken() {
  return jwt.sign(
    { iss: 'training-backend', aud: 'etraining-internal', scopes: ['etraining.read'] },
    process.env.S2S_JWT_SECRET,
    { expiresIn: '5m' }
  );
}

async function fetchCertifsByIdKachefa(idKachefa) {
  if (!process.env.ETRAINING_BASE_URL) throw new Error('Missing ETRAINING_BASE_URL env var');

  const token = buildServiceToken();
  const url = `${process.env.ETRAINING_BASE_URL}/api/internal/v1/etraining/users/by-idkachefa/${encodeURIComponent(
    idKachefa
  )}/certifs`;

  const resp = await fetch(url, { headers: { 'x-access-token': token } });
  const ct = resp.headers.get('content-type') || '';
  const body = await resp.text();

  if (resp.status === 429) throw new Error('ETRAINING_RATE_LIMIT');
  if (!ct.includes('application/json')) throw new Error(`e-training non JSON response: ${resp.status}`);
  if (!resp.ok) throw new Error(`e-training ${resp.status} ${body}`);

  const json = JSON.parse(body);
  const certifs = Array.isArray(json.certifs) ? json.certifs : [];

  return certifs.map((c) => ({
    title: c.certificationTitle ?? '',
    code: c.code ?? '',
    date: c.date ? new Date(c.date) : null,
  }));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ====================== helpers auth / utils ======================= */
const normalize = (v) => String(v || '').trim();

function isNationalUserFromUser(user) {
  const role = String(user?.role || '').toLowerCase();
  return user?.isAdmin === true || ['national', 'admin_national', 'superadmin'].includes(role);
}

function isRegionalModeratorFromUser(user) {
  const role = String(user?.role || '').toLowerCase();

  // ✅ "moderator" = moderator régional dans ton app (d'après tes logs)
  return [
    'moderator',
    'regional',
    'moderator_regional',
    'admin_regional',
    'region',
  ].includes(role);
}

function isExcludedLevel(level) {
  const lvl = normalize(level);
  return lvl === 'تمهيدية' || lvl === 'شارة خشبية';
}

/* ================================================================ */

/* ---------- Création d'une demande ----------
  POST /api/demandes
-------------------------------------------- */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { sessionId, trainingLevel, branche } = req.body || {};

    if (!isValidId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });
    if (!ALLOWED_LEVELS.has(trainingLevel)) return res.status(400).json({ error: 'Invalid trainingLevel' });
    if (!ALLOWED_BRANCH.has(branche)) return res.status(400).json({ error: 'Invalid branche' });

    const s = await Session.findById(sessionId)
      .select(
        'title inscriptionStartDate inscriptionEndDate trainingLevels branche organizer organizerRegion organizerName startDate endDate'
      )
      .lean();
    if (!s) return res.status(404).json({ error: 'Session not found' });

    if (!Array.isArray(s.trainingLevels) || !s.trainingLevels.includes(trainingLevel))
      return res.status(400).json({ error: 'trainingLevel not available for this session' });

    if (!Array.isArray(s.branche) || !s.branche.includes(branche))
      return res.status(400).json({ error: 'branche not available for this session' });

    const now = new Date();
    const start = new Date(s.inscriptionStartDate);
    const end = new Date(s.inscriptionEndDate);

    if (!Number.isNaN(start.getTime()) && now < start)
      return res.status(400).json({ error: 'Registration not opened yet' });
    if (!Number.isNaN(end.getTime()) && now > end)
      return res.status(400).json({ error: 'Registration closed' });

    const u = await User.findById(userId).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });

    const prenom = u.prenom || u.firstName || u.firstname || '';
    const nom = u.nom || u.lastName || u.lastname || '';
    const idScout = u.idScout || u.scoutId || u.idKachefa || u.kachefaId || '';

    const userRegion = normalize(u.region);
    const level = normalize(trainingLevel);
    const organizer = normalize(s.organizer || s.organizerRegion || s.organizerName);

    // ✅ auto approve region if:
    // - level != تمهيدية && != شارة خشبية
    // - organizer == userRegion
    const autoApproveRegion = !isExcludedLevel(level) && organizer && userRegion && organizer === userRegion;

    let certifsSnapshot = [];
    try {
      if (idScout && /^\d{10}$/.test(String(idScout))) {
        certifsSnapshot = await fetchCertifsByIdKachefa(String(idScout));
      }
    } catch (e) {
      console.error('[e-training sync] failed:', e.message);
      certifsSnapshot = [];
    }

    const doc = await Demande.create({
      session: sessionId,
      applicant: userId,
      applicantSnapshot: {
        idScout: String(idScout || ''),
        firstName: prenom,
        lastName: nom,
        email: u.email || '',
        region: u.region || '',
      },
      certifsSnapshot,
      trainingLevel,
      branche,
      statusRegion: autoApproveRegion ? 'APPROVED' : 'PENDING',
      statusNational: 'PENDING',
    });

    return res.status(201).json({
      ok: true,
      demande: {
        _id: doc._id,
        certifsSnapshot: doc.certifsSnapshot,
        statusRegion: doc.statusRegion,
        statusNational: doc.statusNational,
      },
    });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'Demande déjà existante pour cette session' });
    next(err);
  }
});

/* ---------- Récupérer ma demande pour une session ----------
  GET /api/demandes/mine?sessionId=...
-------------------------------------------- */
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { sessionId } = req.query;
    if (!isValidId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });

    const d = await Demande.findOne({ session: sessionId, applicant: userId }).lean();
    if (!d) return res.json(null);

    return res.json({
      _id: d._id,
      session: d.session,
      applicant: d.applicant,
      applicantSnapshot: d.applicantSnapshot,
      certifsSnapshot: d.certifsSnapshot || [],
      trainingLevel: d.trainingLevel,
      branche: d.branche,
      statusRegion: d.statusRegion,
      statusNational: d.statusNational,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------- Validation régionale ----------
  PATCH /api/demandes/:id/region
  ✅ Région du demandeur (ou national/admin)
-------------------------------------------- */
router.patch('/:id/region', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { statusRegion } = req.body;

    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid id' });
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(statusRegion)) {
      return res.status(400).json({ error: 'Invalid statusRegion' });
    }

    const d = await Demande.findById(id).lean();
    if (!d) return res.status(404).json({ error: 'Demande not found' });

    const national = isNationalUserFromUser(req.user);
    if (!national) {
      if (!isRegionalModeratorFromUser(req.user)) return res.status(403).json({ error: 'Forbidden' });

      const userReg = normalize(req.user?.region);
      const applicantReg = normalize(d.applicantSnapshot?.region);

      if (!userReg || !applicantReg || userReg !== applicantReg) {
        return res.status(403).json({ error: 'Forbidden (not applicant region moderator)' });
      }
    }

    await Demande.updateOne({ _id: id }, { $set: { statusRegion } });
    return res.json({ ok: true, statusRegion });
  } catch (err) {
    next(err);
  }
});

/* ---------- Décision finale ----------
  PATCH /api/demandes/:id/national

  ✅ RÈGLE UNIFIÉE:
  - niveaux تمهيدية/شارة خشبية => NATIONAL ONLY (final = national)
  - autres niveaux =>
      final = région organisatrice (ou national/admin)
      * si non national: user doit être moderator régional + user.region == organizerRegion
      * blocage: statusRegion doit être APPROVED (sinon 409)
-------------------------------------------- */
router.patch('/:id/national', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { statusNational } = req.body;

    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid id' });
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(statusNational)) {
      return res.status(400).json({ error: 'Invalid statusNational' });
    }

    const d = await Demande.findById(id).lean();
    if (!d) return res.status(404).json({ error: 'Demande not found' });

    const national = isNationalUserFromUser(req.user);

    // تمهيدية/شارة خشبية: national uniquement
    if (isExcludedLevel(d.trainingLevel)) {
      if (!national) return res.status(403).json({ error: 'Forbidden (national only)' });

      await Demande.updateOne({ _id: id }, { $set: { statusNational } });
      return res.json({ ok: true, statusNational });
    }

    // autres niveaux: organisateur (ou national)
    if (!national) {
      if (!isRegionalModeratorFromUser(req.user)) return res.status(403).json({ error: 'Forbidden' });

      const s = await Session.findById(d.session).select('organizer organizerRegion organizerName').lean();
      if (!s) return res.status(404).json({ error: 'Session not found' });

      const organizerReg = normalize(s.organizer || s.organizerRegion || s.organizerName);
      const userReg = normalize(req.user?.region);

      if (!organizerReg || !userReg || organizerReg !== userReg) {
        return res.status(403).json({ error: 'Forbidden (not organizer region moderator)' });
      }

      if (d.statusRegion !== 'APPROVED') {
        return res.status(409).json({ error: 'Cannot decide before applicant region approval' });
      }
    }

    await Demande.updateOne({ _id: id }, { $set: { statusNational } });
    return res.json({ ok: true, statusNational });
  } catch (err) {
    next(err);
  }
});

/* ---------- Liste des demandes d'une session ----------
  GET /api/demandes?sessionId=...&trainingLevel=...&skip=0&limit=100
-------------------------------------------------------- */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, trainingLevel } = req.query;
    const skip = Number(req.query.skip ?? 0);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    if (!isValidId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });

    const filt = { session: sessionId };
    if (trainingLevel) filt.trainingLevel = trainingLevel;

    const [list, total] = await Promise.all([
      Demande.find(filt).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
      Demande.countDocuments(filt),
    ]);

    res.json({ items: list, total, skip, limit });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/demandes/resync-page
 * (inchangé)
 */
router.post('/resync-page', requireAuth, async (req, res, next) => {
  try {
    const sessionId = req.body.sessionId || req.query.sessionId;
    const skip = Number(req.body.skip ?? req.query.skip ?? 0);
    const limit = Math.min(Number(req.body.limit ?? req.query.limit ?? 50), 200);

    if (!isValidId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });

    const filt = { session: sessionId };
    const total = await Demande.countDocuments(filt);

    const demandes = await Demande.find(filt)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'applicant', select: 'idScout scoutId idKachefa kachefaId prenom nom email region' })
      .lean();

    let processed = 0;
    let rateLimited = false;

    for (const d of demandes) {
      const u = d.applicant;
      if (!u) continue;

      const idScout =
        u.idScout || u.scoutId || u.idKachefa || u.kachefaId || d.applicantSnapshot?.idScout || '';

      if (!idScout || !/^\d{10}$/.test(String(idScout))) continue;

      let snap = d.certifsSnapshot || [];

      try {
        await delay(150);
        snap = await fetchCertifsByIdKachefa(String(idScout));
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg === 'ETRAINING_RATE_LIMIT') {
          rateLimited = true;
          break;
        }
        snap = d.certifsSnapshot || [];
      }

      await Demande.updateOne({ _id: d._id }, { $set: { certifsSnapshot: snap } });
      processed++;
    }

    return res.json({
      ok: true,
      processed,
      totalInPage: demandes.length,
      totalAll: total,
      rateLimited,
      next: rateLimited ? null : { sessionId, nextSkip: skip + limit, limit },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/resync-affectations', requireAuth, async (req, res, next) => {
  try {
    const affectationIdsRaw = req.body.affectationIds || [];
    if (!Array.isArray(affectationIdsRaw) || affectationIdsRaw.length === 0) {
      return res.status(400).json({ error: 'affectationIds array is required' });
    }

    const affectationIds = affectationIdsRaw.filter((id) => isValidId(id));
    if (!affectationIds.length) return res.status(400).json({ error: 'No valid affectationIds provided' });

    const affectations = await SessionAffectation.find({
      _id: { $in: affectationIds },
      role: 'trainee',
    })
      .populate({
        path: 'user',
        select: 'idScout scoutId idKachefa kachefaId prenom nom email region certifsSnapshot',
      })
      .lean();

    if (!affectations.length) {
      return res.json({
        ok: true,
        processed: 0,
        totalAffectations: 0,
        rateLimited: false,
        message: 'No trainee affectations found for given ids',
      });
    }

    let processed = 0;
    let skippedInvalidId = 0;
    let rateLimited = false;

    for (const a of affectations) {
      const u = a.user;
      if (!u) continue;

      const idScout = u.idScout || u.scoutId || u.idKachefa || u.kachefaId || '';
      if (!idScout || !/^[0-9]{10}$/.test(String(idScout))) {
        skippedInvalidId++;
        continue;
      }

      let snap = u.certifsSnapshot || [];
      try {
        await delay(150);
        snap = await fetchCertifsByIdKachefa(String(idScout));
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg === 'ETRAINING_RATE_LIMIT') {
          rateLimited = true;
          break;
        }
        snap = u.certifsSnapshot || [];
      }

      await User.updateOne({ _id: u._id }, { $set: { certifsSnapshot: snap } });
      await Demande.updateMany({ applicant: u._id }, { $set: { certifsSnapshot: snap } });
      processed++;
    }

    return res.json({ ok: true, processed, totalAffectations: affectations.length, skippedInvalidId, rateLimited });
  } catch (err) {
    next(err);
  }
});

/* ---------- GET /api/demandes/regional ----------
   ✅ renvoie les demandes visibles + flags UI (_ui)
-------------------------------------------- */
router.get('/regional', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, trainingLevel } = req.query;
    const skip = Number(req.query.skip ?? 0);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    if (!isValidId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });

    const userReg = normalize(req.user?.region);
    const national = isNationalUserFromUser(req.user);

    if (!userReg && !national) return res.status(403).json({ error: 'Missing user region' });

    const s = await Session.findById(sessionId).select('organizer organizerRegion organizerName').lean();
    if (!s) return res.status(404).json({ error: 'Session not found' });

    const organizer = normalize(s.organizer || s.organizerRegion || s.organizerName);

    const filt = { session: sessionId };
    if (trainingLevel) filt.trainingLevel = trainingLevel;

    // 🔎 visibilité (conserve ton comportement historique)
    if (!national) {
      const level = normalize(trainingLevel);
      const allowAllRegions = organizer && userReg && organizer === userReg && !isExcludedLevel(level);
      if (!allowAllRegions) filt['applicantSnapshot.region'] = userReg;
    }

    const [list, total] = await Promise.all([
      Demande.find(filt).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
      Demande.countDocuments(filt),
    ]);

    const isRegionalMod = isRegionalModeratorFromUser(req.user);
    const lvl = normalize(trainingLevel);
    const excluded = isExcludedLevel(lvl);

    const items = list.map((d) => {
      const applicantReg = normalize(d.applicantSnapshot?.region);

      // ✅ peut décider statusRegion si: national OR (regional mod + même région que demandeur)
      const canSetRegion = national || (isRegionalMod && userReg && applicantReg && userReg === applicantReg);

      // ✅ peut décider statusNational si:
      // - si excluded level: national only
      // - sinon: national OR (regional mod + même région que l'organisateur)
      const canSetNational = excluded
        ? national
        : (national || (isRegionalMod && userReg && organizer && userReg === organizer));
          console.log('USER.role=', req.user?.role);
    console.log('USER.region=', JSON.stringify(req.user?.region), 'len=', String(req.user?.region||'').length);
    console.log('APP.region=', JSON.stringify(d.applicantSnapshot?.region), 'len=', String(d.applicantSnapshot?.region||'').length);
    console.log('NORM user=', JSON.stringify(userReg));
    console.log('NORM app =', JSON.stringify(applicantReg));
      return {
        ...d,
        _ui: {
          level: lvl,
          isExcludedLevel: excluded,
          organizerRegion: organizer,
          canSetRegion,
          canSetNational,
        },
      };
      

    });



    return res.json({ items, total, skip, limit });


  } catch (err) {
    next(err);
  }
});

/* ---------- POST /api/demandes/regional/resync-page ----------
   (inchangé, mais garde la visibilité identique à /regional)
-------------------------------------------- */
router.post('/regional/resync-page', requireAuth, async (req, res, next) => {
  try {
    const sessionId = req.body.sessionId || req.query.sessionId;
    const trainingLevel = req.body.trainingLevel || req.query.trainingLevel;
    const skip = Number(req.body.skip ?? req.query.skip ?? 0);
    const limit = Math.min(Number(req.body.limit ?? req.query.limit ?? 50), 200);

    if (!isValidId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });

    const userReg = normalize(req.user?.region);
    const national = isNationalUserFromUser(req.user);

    if (!national && !userReg) return res.status(403).json({ error: 'Missing user region' });

    const s = await Session.findById(sessionId).select('organizer organizerRegion organizerName').lean();
    if (!s) return res.status(404).json({ error: 'Session not found' });

    const organizer = normalize(s.organizer || s.organizerRegion || s.organizerName);

    const filt = { session: sessionId };
    if (trainingLevel) filt.trainingLevel = trainingLevel;

    if (!national) {
      const level = normalize(trainingLevel);
      const allowAllRegions = organizer && userReg && organizer === userReg && !isExcludedLevel(level);
      if (!allowAllRegions) filt['applicantSnapshot.region'] = userReg;
    }

    const totalAll = await Demande.countDocuments(filt);

    const demandes = await Demande.find(filt)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'applicant', select: 'idScout scoutId idKachefa kachefaId prenom nom email region' })
      .lean();

    let processed = 0;
    let skippedInvalidId = 0;
    let rateLimited = false;

    for (const d of demandes) {
      const u = d.applicant;
      if (!u) continue;

      const idScout =
        u.idScout || u.scoutId || u.idKachefa || u.kachefaId || d.applicantSnapshot?.idScout || '';

      if (!idScout || !/^[0-9]{10}$/.test(String(idScout))) {
        skippedInvalidId++;
        continue;
      }

      let snap = d.certifsSnapshot || [];
      try {
        await delay(150);
        snap = await fetchCertifsByIdKachefa(String(idScout));
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg === 'ETRAINING_RATE_LIMIT') {
          rateLimited = true;
          break;
        }
        snap = d.certifsSnapshot || [];
      }

      await Demande.updateOne({ _id: d._id }, { $set: { certifsSnapshot: snap } });
      processed++;
    }

    return res.json({
      ok: true,
      processed,
      totalInPage: demandes.length,
      totalAll,
      skippedInvalidId,
      rateLimited,
      next: rateLimited ? null : { sessionId, trainingLevel, nextSkip: skip + limit, limit },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
