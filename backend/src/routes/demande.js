// routes/demandes.js (training)
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
// Si Node < 18, décommente la ligne suivante et fais: npm i node-fetch
// const fetch = require('node-fetch');

const Demande = require('../models/demande');
const Session = require('../models/session');
const User    = require('../models/user');
const requireAuth = require('../middlewares/auth');

const router = express.Router();
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const ALLOWED_LEVELS  = new Set(['شارة خشبية', 'تمهيدية']);
const ALLOWED_BRANCH  = new Set(['رواد','جوالة','دليلات','كشافة','مرشدات','أشبال','زهرات','عصافير']);

/* ====================== helpers e-training ======================= */
function buildServiceToken() {
  return jwt.sign(
    { iss: 'training-backend', aud: 'etraining-internal', scopes: ['etraining.read'] },
    process.env.S2S_JWT_SECRET,
    { expiresIn: '5m' }
  );
}


async function fetchCertifsByIdKachefa(idKachefa) {
  if (!process.env.ETRAINING_BASE_URL) {
    throw new Error('Missing ETRAINING_BASE_URL env var');
  }

  const token = buildServiceToken();
  const url = `${process.env.ETRAINING_BASE_URL}/api/internal/v1/etraining/users/by-idkachefa/${encodeURIComponent(idKachefa)}/certifs`;

  console.log('[e-training] calling URL:', url);

  const resp = await fetch(url, { headers: { 'x-access-token': token } });

  const ct = resp.headers.get('content-type') || '';
  const body = await resp.text();

  console.log('[e-training] status:', resp.status);
  console.log('[e-training] content-type:', ct);
  console.log('[e-training] body preview:', body.slice(0, 200));

  // 👉 cas rate-limit: on renvoie une erreur explicite
  if (resp.status === 429) {
    throw new Error('ETRAINING_RATE_LIMIT');
  }

  if (!ct.includes('application/json')) {
    throw new Error(`e-training non JSON response: ${resp.status}`);
  }

  if (!resp.ok) {
    throw new Error(`e-training ${resp.status} ${body}`);
  }

  const json = JSON.parse(body);
  const certifs = Array.isArray(json.certifs) ? json.certifs : [];

  return certifs.map(c => ({
    title: c.certificationTitle ?? '',
    code:  c.code ?? '',
    date:  c.date ? new Date(c.date) : null,
  }));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshCertifsForSession(sessionId) {
  const demandes = await Demande.find({ session: sessionId })
    .select('_id applicant trainingLevel branche certifsSnapshot applicantSnapshot')
    .populate({
      path: 'applicant',
      select: 'idScout scoutId idKachefa kachefaId prenom nom email region',
    })
    .lean();

  for (const d of demandes) {
    const u = d.applicant;
    if (!u) continue;

    const idScout =
      u.idScout ||
      u.scoutId ||
      u.idKachefa ||
      u.kachefaId ||
      d.applicantSnapshot?.idScout ||
      '';

    if (!idScout || !/^\d{10}$/.test(String(idScout))) {
      // pas d’ID exploitable → on skip
      continue;
    }

    let snap = d.certifsSnapshot || [];
    let attempts = 0;

    while (attempts < 3) {
      attempts++;
      try {
        snap = await fetchCertifsByIdKachefa(String(idScout));
        break; // succès → on sort du while
      } catch (e) {
        const msg = String(e?.message || '');
        console.error('[e-training refresh] error for', idScout, msg);

        // Si c’est un 429, on attend puis on retente
        if (msg.includes('429')) {
          // backoff progressif : 1s, puis 2s, puis 3s
          await delay(1000 * attempts);
          continue;
        }

        // autre erreur → on abandonne pour cet utilisateur
        break;
      }
    }

    // on sauve même si c’est resté à l’ancien snapshot
    await Demande.updateOne(
      { _id: d._id },
      { $set: { certifsSnapshot: snap } }
    );

    // petit délai global entre chaque user pour ne pas saturer même sans 429
    await delay(200);
  }
}

/* ================================================================ */

/* ---------- Création d'une demande ----------
  POST /api/demandes
-------------------------------------------- */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { sessionId, trainingLevel, branche } = req.body || {};

    if (!isValidId(sessionId))                     return res.status(400).json({ error: 'Invalid sessionId' });
    if (!ALLOWED_LEVELS.has(trainingLevel))       return res.status(400).json({ error: 'Invalid trainingLevel' });
    if (!ALLOWED_BRANCH.has(branche))             return res.status(400).json({ error: 'Invalid branche' });

    const s = await Session.findById(sessionId)
      .select('title inscriptionStartDate inscriptionEndDate trainingLevels branche')
      .lean();
    if (!s) return res.status(404).json({ error: 'Session not found' });

    if (!Array.isArray(s.trainingLevels) || !s.trainingLevels.includes(trainingLevel))
      return res.status(400).json({ error: 'trainingLevel not available for this session' });

    if (!Array.isArray(s.branche) || !s.branche.includes(branche))
      return res.status(400).json({ error: 'branche not available for this session' });

    // Vérifie la période d'inscription
    const now = new Date();
    const start = new Date(s.inscriptionStartDate);
    const end   = new Date(s.inscriptionEndDate);
    if (!Number.isNaN(start.getTime()) && now < start) return res.status(400).json({ error: 'Registration not opened yet' });
    if (!Number.isNaN(end.getTime())   && now > end)   return res.status(400).json({ error: 'Registration closed' });

    // Récupère le profil utilisateur
    const u = await User.findById(userId).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });

    const prenom = u.prenom || u.firstName || u.firstname || '';
    const nom    = u.nom    || u.lastName  || u.lastname  || '';
    // idKachefa côté training peut être stocké sous différentes clés
    const idScout = u.idScout || u.scoutId || u.idKachefa || u.kachefaId || '';

    // 🔗 Appel e-training pour snapshotter les certifs au moment T
    let certifsSnapshot = [];
    try {
      if (idScout && /^\d{10}$/.test(String(idScout))) {
        certifsSnapshot = await fetchCertifsByIdKachefa(String(idScout));
      }
    } catch (e) {
      // On ne bloque pas la création si l’upstream est KO — à adapter selon ta politique
      // return res.status(502).json({ error: 'Upstream e-training failed', detail: e.message });
      console.error('[e-training sync] failed:', e.message);
      certifsSnapshot = []; // fallback: pas de certifs
    }

    const doc = await Demande.create({
      session: sessionId,
      applicant: userId,
      applicantSnapshot: {
        idScout:  String(idScout || ''),
        firstName: prenom,
        lastName:  nom,
        email:    u.email || '',
        region:   u.region || '',
      },
      certifsSnapshot, // ⬅️ snapshot minimal (title/code/date)
      trainingLevel,
      branche,
      statusRegion: 'PENDING',
      statusNational: 'PENDING',
    });

    return res.status(201).json({
      ok: true,
      demande: { _id: doc._id, certifsSnapshot: doc.certifsSnapshot }
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Demande déjà existante pour cette session' });
    }
    next(err);
  }
});

/* ---------- Récupérer ma demande pour une session ----------
  GET /api/demandes/mine?sessionId=...
-------------------------------------------- */
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const userId   = req.user?.id;
    const { sessionId } = req.query;
    if (!isValidId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });

    const d = await Demande.findOne({ session: sessionId, applicant: userId }).lean();
    if (!d) return res.json(null);

    return res.json({
      _id: d._id,
      session: d.session,
      applicant: d.applicant,
      applicantSnapshot: d.applicantSnapshot,
      certifsSnapshot: d.certifsSnapshot || [],   // ⬅️ renvoyé au front
      trainingLevel: d.trainingLevel,
      branche: d.branche,
      statusRegion: d.statusRegion,
      statusNational: d.statusNational,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt
    });
  } catch (err) {
    next(err);
  }
});

/* ---------- Validation régionale ----------
  PATCH /api/demandes/:id/region
-------------------------------------------- */
router.patch('/:id/region', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { statusRegion } = req.body;
    if (!['PENDING','APPROVED','REJECTED'].includes(statusRegion)) {
      return res.status(400).json({ error: 'Invalid statusRegion' });
    }

    const d = await Demande.findById(id);
    if (!d) return res.status(404).json({ error: 'Demande not found' });

    // TODO: ajouter logique d'autorisation régionale (selon req.user.region)
    d.statusRegion = statusRegion;
    await d.save();
    return res.json({ ok: true, statusRegion: d.statusRegion });
  } catch (err) {
    next(err);
  }
});

/* ---------- Validation nationale ----------
  PATCH /api/demandes/:id/national
-------------------------------------------- */
router.patch('/:id/national', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { statusNational } = req.body;
    if (!['PENDING','APPROVED','REJECTED'].includes(statusNational)) {
      return res.status(400).json({ error: 'Invalid statusNational' });
    }

    const d = await Demande.findById(id);
    if (!d) return res.status(404).json({ error: 'Demande not found' });

    // TODO: ajouter logique d'autorisation nationale (admin national uniquement)
    d.statusNational = statusNational;
    await d.save();
    return res.json({ ok: true, statusNational: d.statusNational });
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
    const skip  = Number(req.query.skip  ?? 0);
    const limit = Math.min(Number(req.query.limit ?? 50), 200); // garde un max raisonnable

    if (!isValidId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });

    const filt = { session: sessionId };
    if (trainingLevel) filt.trainingLevel = trainingLevel;

    const [list, total] = await Promise.all([
      Demande.find(filt)
        .sort({ createdAt: 1 })     // ⚠️ important : ordre stable pour pagination
        .skip(skip)
        .limit(limit)
        .lean(),
      Demande.countDocuments(filt),
    ]);

    res.json({
      items: list,
      total,
      skip,
      limit,
    });
  } catch (err) {
    next(err);
  }
});
/**
 * POST /api/demandes/resync-page
 * Body (ou query): { sessionId, skip, limit }
 */
router.post('/resync-page', requireAuth, async (req, res, next) => {
  try {
    const sessionId = req.body.sessionId || req.query.sessionId;
    const skip  = Number(req.body.skip  ?? req.query.skip  ?? 0);
    const limit = Math.min(Number(req.body.limit ?? req.query.limit ?? 50), 200);

    if (!isValidId(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }

    // TODO: contrôle d'accès (moderator / director / trainer autorisé sur cette session)

    // On récupère toutes les demandes de la session, triées de façon stable
    const filt = { session: sessionId };
    const total = await Demande.countDocuments(filt);

    const demandes = await Demande.find(filt)
      .sort({ createdAt: 1 }) // ↩️ même ordre que le GET
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'applicant',
        select: 'idScout scoutId idKachefa kachefaId prenom nom email region',
      })
      .lean();

    let processed = 0;
    let rateLimited = false;

    for (const d of demandes) {
      const u = d.applicant;
      if (!u) continue;

      const idScout =
        u.idScout ||
        u.scoutId ||
        u.idKachefa ||
        u.kachefaId ||
        d.applicantSnapshot?.idScout ||
        '';

      if (!idScout || !/^\d{10}$/.test(String(idScout))) {
        continue;
      }

      let snap = d.certifsSnapshot || [];

      try {
        // petit délai pour éviter de spammer l'APIGW
        await delay(150);

        snap = await fetchCertifsByIdKachefa(String(idScout));
      } catch (e) {
        const msg = String(e?.message || '');
        console.error('[e-training refresh-page] error for', idScout, msg);

        if (msg === 'ETRAINING_RATE_LIMIT') {
          rateLimited = true;
          break; // on stoppe la boucle, on renvoie processed tel quel
        }

        // autre erreur: on laisse l'ancien snapshot
        snap = d.certifsSnapshot || [];
      }

      await Demande.updateOne(
        { _id: d._id },
        { $set: { certifsSnapshot: snap } }
      );
      processed++;
    }

    return res.json({
      ok: true,
      processed,          // nb de demandes réellement rafraîchies
      totalInPage: demandes.length,
      totalAll: total,
      rateLimited,        // true si on s'est arrêté à cause d'un 429
      next: rateLimited ? null : { sessionId, nextSkip: skip + limit, limit },
    });
  } catch (err) {
    next(err);
  }
});
/**
 * POST /api/demandes/resync-page
 * Body: { sessionId, skip, limit, userIds?: string[] }
 */
router.post('/resync-formation', requireAuth, async (req, res, next) => {
  try {
    const sessionId = req.body.sessionId || req.query.sessionId;
    const skipRaw  = req.body.skip  ?? req.query.skip  ?? 0;
    const limitRaw = req.body.limit ?? req.query.limit ?? 50;

    if (!isValidId(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }

    // ⚠️ nouveau : support userIds ciblés
    const userIdsRaw = req.body.userIds || req.query.userIds || [];
    const userIds = Array.isArray(userIdsRaw)
      ? userIdsRaw.filter((id) => isValidId(id))
      : [];

    // TODO: contrôle d'accès (moderator / director / trainer autorisé sur cette session)

    const filt = { session: sessionId };

    // Si on a des userIds -> on ne traite que ces applicants
    if (userIds.length > 0) {
      filt.applicant = { $in: userIds };
    }

    const skip  = userIds.length > 0 ? 0 : Number(skipRaw);
    const limit = userIds.length > 0
      ? Math.min(userIds.length, 200) // ciblé = max 200 users
      : Math.min(Number(limitRaw), 200);

    const total = await Demande.countDocuments(filt);

    const demandes = await Demande.find(filt)
      .sort({ createdAt: 1 }) // ↩️ même ordre que le GET "normal"
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'applicant',
        select: 'idScout scoutId idKachefa kachefaId prenom nom email region',
      })
      .lean();

    let processed = 0;
    let rateLimited = false;

    for (const d of demandes) {
      const u = d.applicant;
      if (!u) continue;

      const idScout =
        u.idScout ||
        u.scoutId ||
        u.idKachefa ||
        u.kachefaId ||
        d.applicantSnapshot?.idScout ||
        '';

      if (!idScout || !/^\d{10}$/.test(String(idScout))) {
        continue;
      }

      let snap = d.certifsSnapshot || [];

      try {
        await delay(150); // éviter le spam APIGW
        snap = await fetchCertifsByIdKachefa(String(idScout));
      } catch (e) {
        const msg = String(e?.message || '');
        console.error('[e-training refresh-page] error for', idScout, msg);

        if (msg === 'ETRAINING_RATE_LIMIT') {
          rateLimited = true;
          break;
        }

        snap = d.certifsSnapshot || [];
      }

      await Demande.updateOne(
        { _id: d._id },
        { $set: { certifsSnapshot: snap } }
      );
      processed++;
    }

    // Si on était en mode ciblé (userIds), pas de notion de "next page"
    const next =
      userIds.length > 0 || rateLimited
        ? null
        : { sessionId, nextSkip: skip + limit, limit };

    return res.json({
      ok: true,
      processed,
      totalInPage: demandes.length,
      totalAll: total,
      rateLimited,
      next,
    });
  } catch (err) {
    next(err);
  }
});


module.exports = router;
