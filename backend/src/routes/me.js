// src/routes/me.js
const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const User = require('../models/user');
const requireAuth = require('../middlewares/auth');

const SessionAffectation = require('../models/affectation');
const Formation = require('../models/formation');
const Session = require('../models/session');
const FinalDecision = require('../models/finalDecision');

const router = express.Router();

/* -------------------------------------------------
 * Helper pour récupérer l'id utilisateur de manière robuste
 * ------------------------------------------------- */
function getUserIdFromRequest(req) {
  if (req.user && (req.user._id || req.user.id)) {
    return (req.user._id || req.user.id).toString();
  }
  if (req.userId) {
    return req.userId.toString();
  }
  if (req.auth && (req.auth._id || req.auth.id)) {
    return (req.auth._id || req.auth.id).toString();
  }
  return null;
}

function oid(x) {
  try {
    return typeof x === 'string' ? new mongoose.Types.ObjectId(x) : x;
  } catch {
    return x;
  }
}

/* -------------------------------------------------
 * Dossier des signatures
 * ------------------------------------------------- */
const SIGNATURES_DIR =
  process.env.SIGNATURES_DIR || path.join(__dirname, '..', 'uploads', 'signatures');

if (!fs.existsSync(SIGNATURES_DIR)) {
  fs.mkdirSync(SIGNATURES_DIR, { recursive: true });
}

/* -------------------------------------------------
 * GET /api/signatures/me
 * ------------------------------------------------- */
router.get('/signatures/me', requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Utilisateur non authentifié' });

    const user = await User.findById(userId).select('signatureUrl').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.signatureUrl) {
      return res.json({ hasSignature: true, signatureUrl: user.signatureUrl });
    }
    return res.json({ hasSignature: false });
  } catch (err) {
    console.error('[signatures.me] GET error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/* -------------------------------------------------
 * POST /api/signatures/me
 * Body: { dataUrl: "data:image/png;base64,...." }
 * ------------------------------------------------- */
router.post('/signatures/me', requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Utilisateur non authentifié' });

    const { dataUrl } = req.body;
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ message: 'dataUrl is required' });
    }

    const prefix = 'data:image/png;base64,';
    if (!dataUrl.startsWith(prefix)) {
      return res.status(400).json({ message: 'Invalid dataUrl format' });
    }

    const base64Data = dataUrl.slice(prefix.length);
    const buffer = Buffer.from(base64Data, 'base64');

    const fileName = `signature_${userId}.png`;
    const filePath = path.join(SIGNATURES_DIR, fileName);

    fs.writeFileSync(filePath, buffer);

    // URL publique (en supposant app.use('/uploads', ...) dans app.js)
    const publicUrl = `/uploads/signatures/${fileName}`;

    await User.findByIdAndUpdate(userId, { signatureUrl: publicUrl });

    return res.json({ message: 'Signature saved', signatureUrl: publicUrl });
  } catch (err) {
    console.error('[signatures.me] POST error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/* -------------------------------------------------
 * GET /api/me/parcours
 * - N'affiche PAS les formations sans FinalDecision
 * - N'affiche la décision QUE si session.isVisible=true
 * ------------------------------------------------- */
router.get('/me/parcours', requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Utilisateur non authentifié' });

    // 1) FinalDecision (source de ton écran)
    const fds = await FinalDecision.find({ trainee: oid(userId) })
      .select('session formation decision status updatedAt createdAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    if (!fds.length) return res.json({ formations: [] });

    // 2) Dédoublonnage
    const byKey = new Map();
    for (const fd of fds) {
      const key = `${String(fd.session)}|${String(fd.formation)}`;
      if (!byKey.has(key)) byKey.set(key, fd);
    }
    const uniqFDs = Array.from(byKey.values());

    const formationIds = [...new Set(uniqFDs.map(fd => String(fd.formation)).filter(Boolean))];
    const sessionIds = [...new Set(uniqFDs.map(fd => String(fd.session)).filter(Boolean))];

    // 3) Charger formations/sessions + TES affectations trainee
    const [formations, sessions, traineeAffs] = await Promise.all([
      Formation.find({ _id: { $in: formationIds.map(oid) } })
        .select('_id nom niveau centreTitleSnapshot centreRegionSnapshot')
        .lean(),

      Session.find({ _id: { $in: sessionIds.map(oid) } })
        .select('_id title isVisible startDate endDate')
        .lean(),

      SessionAffectation.find({
        user: oid(userId),
        role: 'trainee',
        session: { $in: sessionIds.map(oid) },
        formation: { $in: formationIds.map(oid) },
      })
        .select('session formation isPresent')
        .lean(),
    ]);

    const formationById = new Map((formations || []).map(f => [String(f._id), f]));
    const sessionById = new Map((sessions || []).map(s => [String(s._id), s]));

    // 4) Map trainee isPresent par couple
    const traineeByKey = new Map();
    for (const a of traineeAffs || []) {
      const key = `${String(a.session)}|${String(a.formation)}`;
      if (!traineeByKey.has(key)) traineeByKey.set(key, a);
    }

    // ✅ 5) Construire les couples depuis TES affectations trainee
    const pairs = (traineeAffs || [])
      .filter(a => a.session && a.formation)
      .map(a => ({
        session: a.session,     // ObjectId
        formation: a.formation, // ObjectId
      }));

    // 6) Rechercher les affectations director sur ces mêmes couples
    let directorsAffs = [];
    if (pairs.length) {
      directorsAffs = await SessionAffectation.find({
        role: 'director',
        $or: pairs, // match EXACT couple (session, formation)
      })
        .select('session formation user updatedAt createdAt')
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
    }

    // 7) Map director userId par couple (session|formation)
    const directorUserIdByKey = new Map();
    const directorUserIds = new Set();

    for (const d of directorsAffs || []) {
      const key = `${String(d.session)}|${String(d.formation)}`;
      // on garde le + récent grâce au sort desc
      if (!directorUserIdByKey.has(key) && d.user) {
        const uid = String(d.user);
        directorUserIdByKey.set(key, uid);
        directorUserIds.add(uid);
      }
    }

    // 8) Charger les users directors (nom/prenom)
    const directorUsers = directorUserIds.size
      ? await User.find({ _id: { $in: Array.from(directorUserIds).map(oid) } })
          .select('_id nom prenom')
          .lean()
      : [];

    const userById = new Map((directorUsers || []).map(u => [String(u._id), u]));

    // 9) Construire la sortie
    const out = uniqFDs
      .map(fd => {
        const sId = String(fd.session);
        const fId = String(fd.formation);
        const key = `${sId}|${fId}`;

        const s = sessionById.get(sId);
        const f = formationById.get(fId);
        const a = traineeByKey.get(key);

        const visible = !!s?.isVisible;

        const directorUid = directorUserIdByKey.get(key);
        const directorUser = directorUid ? userById.get(String(directorUid)) : null;

        return {
          sessionId: sId,
          sessionTitle: s?.title || '',
          sessionVisible: visible,

          formationId: fId,
          formationNom: f?.nom || '',
          formationNiveau: f?.niveau || '',
          centreTitleSnapshot: f?.centreTitleSnapshot || '',
          centreRegionSnapshot: f?.centreRegionSnapshot || '',

          isPresent: a ? !!a.isPresent : false,

          director: directorUser
            ? { id: String(directorUser._id), prenom: directorUser.prenom || '', nom: directorUser.nom || '' }
            : null,

          decision: visible ? (fd.decision || null) : null,
          status: visible ? (fd.status || null) : null,
        };
      })
      .filter(x => x.sessionId && x.formationId);

    return res.json({ formations: out });
  } catch (err) {
    console.error('[me.parcours] GET error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
