const express = require('express');
const mongoose = require('mongoose');
const Critere = require('../models/critere');
const Session = require('../models/session');

const router = express.Router();

/* Utils */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const allowedLevels = new Set(['شارة خشبية', 'تمهيدية']);
function normStr(v) { return String(v ?? '').trim(); }

/* -------------------------------------------
   GET /api/criteres?session=:id&niveau=:lvl
   → liste des critères d’une session/niveau (optionnellement filtrable par famille)
-------------------------------------------- */
router.get('/', async (req, res, next) => {
  try {
    const { session, niveau, famille } = req.query;

    if (!isValidId(session)) return res.status(400).json({ error: 'Invalid session id' });
    if (!niveau || !allowedLevels.has(niveau)) return res.status(400).json({ error: 'Invalid niveau' });

    const q = { session, niveau };
    if (famille) q.famille = normStr(famille);

    const list = await Critere.find(q)
      .select('_id session niveau famille critere maxnote rank createdAt updatedAt')
      .sort({ famille: 1, rank: 1, critere: 1 })
      .lean()
      .exec();

    return res.json(list);
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------
   GET /api/criteres/familles?session=:id&niveau=:lvl
   → liste distincte des familles pour une session/niveau
-------------------------------------------- */
router.get('/familles', async (req, res, next) => {
  try {
    const { session, niveau } = req.query;

    if (!isValidId(session)) return res.status(400).json({ error: 'Invalid session id' });
    if (!niveau || !allowedLevels.has(niveau)) return res.status(400).json({ error: 'Invalid niveau' });

    const familles = await Critere.distinct('famille', { session, niveau });
    familles.sort((a, b) => a.localeCompare(b, 'ar'));

    return res.json({ session, niveau, familles });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------
   POST /api/criteres
   body: { session, niveau, famille, critere, maxnote?, rank? }
   → crée un critère
-------------------------------------------- */
router.post('/', async (req, res, next) => {
  try {
    const session = req.body?.session;
    const niveau  = normStr(req.body?.niveau);
    const famille = normStr(req.body?.famille);
    const critere = normStr(req.body?.critere);

    let maxnote = req.body?.maxnote;
    let rank    = req.body?.rank;

    if (!isValidId(session)) return res.status(400).json({ error: 'Invalid session id' });
    if (!allowedLevels.has(niveau)) return res.status(400).json({ error: 'Invalid niveau' });
    if (!famille) return res.status(400).json({ error: 'famille is required' });
    if (!critere) return res.status(400).json({ error: 'critere is required' });

    const s = await Session.findById(session).select('trainingLevels').lean();
    if (!s) return res.status(404).json({ error: 'Session not found' });
    if (!Array.isArray(s.trainingLevels) || !s.trainingLevels.includes(niveau)) {
      return res.status(400).json({ error: 'niveau not enabled for this session' });
    }

    if (maxnote !== undefined) {
      maxnote = Number(maxnote);
      if (!Number.isFinite(maxnote) || maxnote < 1) {
        return res.status(400).json({ error: 'maxnote must be a positive integer' });
      }
    }
    if (rank !== undefined) {
      rank = Number(rank);
      if (!Number.isFinite(rank) || rank < 1) {
        return res.status(400).json({ error: 'rank must be a positive integer' });
      }
    }

    const doc = await Critere.create({
      session, niveau, famille, critere,
      ...(maxnote !== undefined ? { maxnote } : {}),
      ...(rank    !== undefined ? { rank }    : {}),
    });

    return res.status(201).json({
      ok: true,
      critere: {
        _id: doc._id, session, niveau, famille, critere,
        maxnote: doc.maxnote, rank: doc.rank,
      }
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Critère déjà existant pour cette session/niveau/famille' });
    }
    next(err);
  }
});

/* -------------------------------------------
   PATCH /api/criteres/:id
   body: { famille?, critere? }
   → modifie libellés (pas session/niveau)
-------------------------------------------- */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid id' });

    const update = {};
    if (req.body?.famille != null) update.famille = normStr(req.body.famille);
    if (req.body?.critere != null) update.critere = normStr(req.body.critere);

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const updated = await Critere.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) return res.sendStatus(404);
    return res.json({ ok: true, critere: updated });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Conflit: ce critère existe déjà' });
    }
    next(err);
  }
});

/* -------------------------------------------
   DELETE /api/criteres/:id
-------------------------------------------- */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid id' });

    const r = await Critere.deleteOne({ _id: id });
    if (r.deletedCount === 0) return res.sendStatus(404);
    return res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------
   POST /api/criteres/famille/delete
   body: { session, niveau, famille }
   → supprime TOUTES les lignes d’une famille pour une session+niveau
-------------------------------------------- */
router.post('/famille/delete', async (req, res, next) => {
  try {
    const session = req.body?.session;
    const niveau  = normStr(req.body?.niveau);
    const famille = normStr(req.body?.famille);

    if (!isValidId(session)) return res.status(400).json({ error: 'Invalid session id' });
    if (!allowedLevels.has(niveau)) return res.status(400).json({ error: 'Invalid niveau' });
    if (!famille) return res.status(400).json({ error: 'famille is required' });

    const r = await Critere.deleteMany({ session, niveau, famille });
    return res.json({ ok: true, deletedCount: r.deletedCount || 0 });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------
   POST /api/criteres/inherit
   body: { fromSession, fromNiveau, toSession, toNiveau }
   → copie avec overwrite (delete + insert)
-------------------------------------------- */
router.post('/inherit', async (req, res, next) => {
  try {
    const { fromSession, fromNiveau, toSession, toNiveau } = req.body || {};

    if (!isValidId(fromSession) || !isValidId(toSession)) {
      return res.status(400).json({ error: 'Invalid session id' });
    }
    if (!allowedLevels.has(fromNiveau) || !allowedLevels.has(toNiveau)) {
      return res.status(400).json({ error: 'Invalid niveau' });
    }
    if (fromSession === toSession && fromNiveau === toNiveau) {
      return res.status(400).json({ error: 'Source and target are identical' });
    }

    const [src, dst] = await Promise.all([
      Session.findById(fromSession).select('trainingLevels title').lean(),
      Session.findById(toSession).select('trainingLevels title').lean(),
    ]);
    if (!src) return res.status(404).json({ error: 'Source session not found' });
    if (!dst) return res.status(404).json({ error: 'Target session not found' });
    if (!src.trainingLevels?.includes(fromNiveau)) {
      return res.status(400).json({ error: 'fromNiveau not enabled in source session' });
    }
    if (!dst.trainingLevels?.includes(toNiveau)) {
      return res.status(400).json({ error: 'toNiveau not enabled in target session' });
    }

    // 1) vider la cible
    await Critere.deleteMany({ session: toSession, niveau: toNiveau });

    // 2) lire la source
    const srcList = await Critere.find({ session: fromSession, niveau: fromNiveau })
      .select('famille critere maxnote rank')
      .lean();

    if (!srcList.length) {
      return res.json({
        ok: true,
        from: { session: fromSession, niveau: fromNiveau },
        to:   { session: toSession,   niveau: toNiveau },
        inserted: 0,
        mode: 'overwrite',
      });
    }

    // 3) insert en masse
    const ops = srcList.map(c => ({
      insertOne: {
        document: {
          session: toSession,
          niveau:  toNiveau,
          famille: c.famille,
          critere: c.critere,
          maxnote: Number.isFinite(c?.maxnote) ? c.maxnote : 1,
          ...(Number.isFinite(c?.rank) ? { rank: c.rank } : {}),
        }
      }
    }));

    let inserted = 0;
    try {
      const r = await Critere.bulkWrite(ops, { ordered: false });
      inserted = r.insertedCount ?? r?.result?.nInserted ?? 0;
      return res.json({
        ok: true,
        from: { session: fromSession, niveau: fromNiveau },
        to:   { session: toSession,   niveau: toNiveau },
        inserted,
        mode: 'overwrite',
      });
    } catch (e) {
      if (e?.writeErrors?.length) {
        inserted = e.result?.nInserted ?? 0;
        return res.status(207).json({
          ok: false,
          partial: true,
          from: { session: fromSession, niveau: fromNiveau },
          to:   { session: toSession,   niveau: toNiveau },
          inserted,
          mode: 'overwrite',
          errors: e.writeErrors.map(w => w.errmsg || w?.err?.errmsg || String(w)),
        });
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------
   GET /api/criteres/stats
   → [{ session, niveau, criteresCount, famillesCount, title, startDate }]
-------------------------------------------- */
router.get('/stats', async (req, res, next) => {
  try {
    const agg = await Critere.aggregate([
      {
        $group: {
          _id: { session: '$session', niveau: '$niveau' },
          criteresCount: { $sum: 1 },
          familles: { $addToSet: '$famille' },
        }
      },
      {
        $project: {
          _id: 0,
          session: '$_id.session',
          niveau: '$_id.niveau',
          criteresCount: 1,
          famillesCount: { $size: '$familles' },
        }
      }
    ]);

    const bySession = new Map();
    const sessionIds = agg.map(a => a.session);
    const sessions = await Session
      .find({ _id: { $in: sessionIds } })
      .select('_id title startDate')
      .lean();
    for (const s of sessions) bySession.set(String(s._id), s);

    const out = agg.map(a => {
      const s = bySession.get(String(a.session));
      return {
        session: String(a.session),
        niveau: a.niveau,
        criteresCount: a.criteresCount,
        famillesCount: a.famillesCount,
        title: s?.title ?? '',
        startDate: s?.startDate ?? null,
      };
    });

    res.json(out);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
