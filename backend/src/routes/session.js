// routes/sessions.js
const mongoose = require('mongoose');  
const router = require('express').Router();
const Session = require('../models/session');
const Demande = require('../models/demande');
const requireAuth = require('../middlewares/auth');
const normalize = (v) => String(v || '').trim();
const NATIONAL_ORG = 'اللجنة الوطنية لتنمية القيادات';

// POST /api/sessions : créer une session
// routes/sessions.js (extrait POST)
router.post('/', async (req, res) => {
  try {
    const {
      title, startDate, endDate,
      inscriptionStartDate, inscriptionEndDate,
      trainingLevels = [], branche = [],
      organizer, // optionnel: si fourni par d’autres écrans on l’accepte
    } = req.body;

    const payload = {
      title: String(title || '').trim(),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      inscriptionStartDate: new Date(inscriptionStartDate),
      inscriptionEndDate: new Date(inscriptionEndDate),
      trainingLevels,
      branche,
    };

    // 🔹 Seulement si fourni explicitement (autre écran)
    if (typeof organizer === 'string' && organizer.trim()) {
      payload.organizer = organizer.trim();
    }
    // Sinon, le default du modèle s’appliquera

    const s = await Session.create(payload);
    return res.status(201).json({ ok: true, session: s });
  } catch (e) {
    if (e?.code === 11000 && (e.keyPattern?.title || e.message?.includes('title_1 dup key'))) {
      return res.status(409).json({ error: 'العنوان موجود بالفعل' });
    }
    console.error('SESSION CREATE ERROR:', e);
    return res.status(400).json({ error: e.message });
  }
});


// GET /api/sessions : lister
router.get('/', async (_req, res) => {
  const sessions = await Session.find().sort({ startDate: -1 });
  res.json(sessions);
});

// GET /api/sessions/regional
// Retourne:
// - sessions organisées par ma région
// - OU sessions organisées par اللجنة الوطنية لتنمية القيادات
// - OU sessions où il existe au moins une demande (Demande) d’un participant de ma région
router.get('/regional', requireAuth, async (req, res, next) => {
  try {
    const userRegion = normalize(req.user?.region);
    if (!userRegion) return res.status(403).json({ error: 'Missing user region' });

    // 1) Sessions où j’ai au moins 1 demandeur de ma région
    const demandeSessionIds = await Demande.distinct('session', {
      'applicantSnapshot.region': userRegion,
    });

    // 2) Sessions organisées par ma région OU National
    // + sessions “cross-region” où j’ai des demandeurs
    const organizerOr = [userRegion, NATIONAL_ORG];

    const sessions = await Session.find({
      $or: [
        { organizer: { $in: organizerOr } },
        { organizerRegion: { $in: organizerOr } },
        { organizerName: { $in: organizerOr } },
        { _id: { $in: demandeSessionIds.filter(id => mongoose.Types.ObjectId.isValid(id)) } },
      ],
    })
      .sort({ startDate: -1, createdAt: -1 })
      .lean();

    return res.json(sessions);
  } catch (err) {
    next(err);
  }
});


// GET /api/sessions/:id : détail
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid session id' });
    }

    const s = await Session.findById(id)
      .select('title startDate endDate inscriptionStartDate inscriptionEndDate trainingLevels branche organizer')
      .lean()
      .exec();

    if (!s) return res.sendStatus(404);

    const toYMD = d => (d ? new Date(d).toISOString().slice(0,10) : '');

    return res.json({
      _id: s._id,
      title: s.title ?? '',
      startDate: toYMD(s.startDate),
      endDate: toYMD(s.endDate),
      inscriptionStartDate: toYMD(s.inscriptionStartDate),
      inscriptionEndDate: toYMD(s.inscriptionEndDate),
      trainingLevels: Array.isArray(s.trainingLevels) ? s.trainingLevels : [],
      branche: Array.isArray(s.branche) ? s.branche : [],
      organizer: s.organizer || 'اللجنة الوطنية لتنمية القيادات',
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/sessions/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid session id' });
    }

    let {
      title, startDate, endDate,
      inscriptionStartDate, inscriptionEndDate,
      trainingLevels, branche,
      organizer, // optionnel
    } = req.body || {};

    if (!Array.isArray(trainingLevels)) trainingLevels = [];
    trainingLevels = [...new Set(trainingLevels.map(String).map(s => s.trim()))];

    const ALLOWED = new Set(['شارة خشبية', 'تمهيدية']);
    const ALLOWED_B = new Set(['رواد','جوالة','دليلات','كشافة','مرشدات','أشبال','زهرات','عصافير']);
    for (const v of trainingLevels) if (!ALLOWED.has(v)) {
      return res.status(400).json({ error: `Invalid training level: ${v}` });
    }
    if (!Array.isArray(branche)) branche = [];
    for (const v of branche) if (!ALLOWED_B.has(v)) {
      return res.status(400).json({ error: `Invalid training branch: ${v}` });
    }

    const update = {
      ...(title != null && { title }),
      ...(startDate != null && { startDate }),
      ...(endDate != null && { endDate }),
      ...(inscriptionStartDate != null && { inscriptionStartDate }),
      ...(inscriptionEndDate != null && { inscriptionEndDate }),
      trainingLevels,
      branche,
      ...(organizer != null && { organizer }), // on permet la MAJ si fournie
    };

    const updated = await Session.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) return res.sendStatus(404);
    return res.json({ ok: true, _id: updated._id });
  } catch (err) {
    next(err);
  }
});
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Valider l'id
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid id format' });
    }

    // 2) Existe ?
    const exists = await Session.exists({ _id: id });
    if (!exists) return res.sendStatus(404);

    // 4) Supprimer la session
    const rSession = await Session.deleteOne({ _id: id });

    // 5) Réponse (ou res.sendStatus(204) si tu préfères)
    return res.status(200).json({
      deleted: rSession.deletedCount === 1
    });
  } catch (e) {
    console.error('DELETE /sessions cascade error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
