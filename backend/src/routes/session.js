// routes/sessions.js
const mongoose = require('mongoose');  
const router = require('express').Router();
const Session = require('../models/session');

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

module.exports = router;
