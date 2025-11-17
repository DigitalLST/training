// routes/dev.seed.formations.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const Session = require('../models/session');
const Centre = require('../models/centre');
const Formation = require('../models/formation');

const router = express.Router();

/* ------------ helpers ------------- */
const normStr = (x) => String(x ?? '').trim();
const normArrayStrings = (arr) =>
  (Array.isArray(arr) ? arr : []).map(normStr).filter(Boolean);

function unique(arr) {
  return Array.from(new Set(arr));
}

/* ------------ BULK SEED ------------- */
/**
 * POST /api/dev/seed/formations/bulk
 * body: Array<{
 *   sessionId: string (ObjectId),
 *   niveau: 'تمهيدية' | 'شارة خشبية',
 *   centreId: string (ObjectId),
 *   nom: string (min 2),
 *   branches: string[]  // doit être autorisé par la session
 * }>
 *
 * Options (facultatives) en query:
 *   ?dryRun=true  => ne crée rien, montre ce qui passerait
 */
router.post(
  '/formations/bulk',
  [
    body().isArray({ min: 1 }).withMessage('Body must be a non-empty array'),
    body('*.sessionId').isMongoId(),
    body('*.niveau').isIn(['تمهيدية', 'شارة خشبية']),
    body('*.centreId').isMongoId(),
    body('*.nom').isString().isLength({ min: 2 }),
    body('*.branches').isArray({ min: 1 }),
    body('*.branches.*').isString().trim().notEmpty(),
  ],
  async (req, res, next) => {
    const v = validationResult(req);
    if (!v.isEmpty()) return res.status(400).json({ errors: v.array() });

    const items = req.body;
    const dryRun = String(req.query.dryRun || '').toLowerCase() === 'true';

    // Préfetch sessions/centres pour limiter les allers-retours DB
    const sessionIds = unique(items.map(x => normStr(x.sessionId)));
    const centreIds  = unique(items.map(x => normStr(x.centreId)));

    const sessions = await Session
      .find({ _id: { $in: sessionIds } })
      .select('_id title branches branche')
      .lean();

    const centres = await Centre
      .find({ _id: { $in: centreIds } })
      .select('_id title region')
      .lean();

    const sessionById = new Map(sessions.map(s => [String(s._id), s]));
    const centreById  = new Map(centres.map(c => [String(c._id), c]));

    const results = [];

    // Pour vérifier l’autorisation des branches par session
    const allowedBranchesCache = new Map(); // sessionId -> Set(allowed)
    function allowedSetForSession(s) {
      const sid = String(s._id);
      if (allowedBranchesCache.has(sid)) return allowedBranchesCache.get(sid);
      const raw = Array.isArray(s.branches) ? s.branches : (Array.isArray(s.branche) ? s.branche : []);
      const allowed = new Set(normArrayStrings(raw));
      allowedBranchesCache.set(sid, allowed);
      return allowed;
    }

    for (const [idx, rawItem] of items.entries()) {
      const sessionId = normStr(rawItem.sessionId);
      const centreId  = normStr(rawItem.centreId);
      const niveau    = normStr(rawItem.niveau);
      const nom       = normStr(rawItem.nom);
      const branches  = normArrayStrings(rawItem.branches);

      // 1) session
      const s = sessionById.get(sessionId);
      if (!s) {
        results.push({ index: idx, status: 'error', error: 'session_not_found', payload: rawItem });
        continue;
      }

      // 2) centre
      const c = centreById.get(centreId);
      if (!c) {
        results.push({ index: idx, status: 'error', error: 'centre_not_found', payload: rawItem });
        continue;
      }

      // 3) branches autorisées par la session
      const allowed = allowedSetForSession(s);
      const notAllowed = branches.filter(b => !allowed.has(b));
      if (notAllowed.length) {
        results.push({
          index: idx,
          status: 'error',
          error: 'branches_not_allowed_for_session',
          details: { notAllowed, allowed: Array.from(allowed) },
          payload: rawItem,
        });
        continue;
      }

      if (dryRun) {
        results.push({ index: idx, status: 'ok_dry_run' });
        continue;
      }

      // 4) création
      try {
        const doc = await Formation.create({
          session: sessionId,
          sessionTitleSnapshot: s.title || '',
          niveau,
          centre: centreId,
          centreTitleSnapshot: c.title || '',
          centreRegionSnapshot: c.region || '',
          nom,
          branches, // multi-branches
        });
        results.push({ index: idx, status: 'created', id: String(doc._id) });
      } catch (e) {
        if (e?.code === 11000) {
          results.push({ index: idx, status: 'duplicate' });
        } else {
          results.push({ index: idx, status: 'error', error: String(e?.message || e) });
        }
      }
    }

    // Summary
    const summary = results.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    return res.json({ ok: true, dryRun, summary, results });
  }
);

module.exports = router;
