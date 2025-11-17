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
  GET /api/demandes?sessionId=...&trainingLevel=...
-------------------------------------------------------- */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, trainingLevel } = req.query;
    if (!isValidId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });
    const filt = { session: sessionId };
    if (trainingLevel) filt.trainingLevel = trainingLevel;
    const list = await Demande.find(filt).lean();
    res.json(list);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
