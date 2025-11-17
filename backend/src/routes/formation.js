// routes/formations.js
const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const Formation = require('../models/formation');
const Session = require('../models/session');
const Centre = require('../models/centre');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

/** Utils */
function normStr(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function normArrayStrings(arr) {
  return (Array.isArray(arr) ? arr : []).map(String).map(s => s.trim()).filter(Boolean);
}

/** GET /api/formations?sessionId=... */
router.get(
  '/',
  requireAuth,
  [query('sessionId').isMongoId().withMessage('sessionId invalide')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sessionId } = req.query;

    const list = await Formation.find({ session: sessionId })
      .select('_id session niveau centre nom branches sessionTitleSnapshot centreTitleSnapshot centreRegionSnapshot createdAt')
      .populate({ path: 'centre', select: 'title region _id' })
      .lean();

    const out = list.map(f => ({
      _id: String(f._id),
      niveau: f.niveau,
      nom: f.nom,
      branches: Array.isArray(f.branches) ? f.branches : [], // ⬅️ renvoi des branches
      centre: f.centre
        ? { _id: String(f.centre._id), title: f.centre.title, region: f.centre.region }
        : { _id: null, title: f.centreTitleSnapshot, region: f.centreRegionSnapshot },
      sessionTitle: f.sessionTitleSnapshot,
      createdAt: f.createdAt,
    }));
    res.json(out);
  }
);

/** POST /api/formations
 *  Accepte:
 *   - { sessionId, niveau, centreId, nom, branches: string[] }  ✅
 *   - { sessionId, niveau, centreId, nom, branche: string }     (fallback)
 */
router.post(
  '/',
  requireAuth,
  [
    body('sessionId').isMongoId(),
    body('niveau').isIn(['تمهيدية', 'شارة خشبية']),
    body('centreId').isMongoId(),
    body('nom').isLength({ min: 2 }).trim(),

    // validation custom: au moins une branche via `branches[]` ou `branche`
    body().custom((req) => {
      const raw = Array.isArray(req.branches) ? req.branches : (req.branche ? [req.branche] : []);
      const arr = normArrayStrings(raw);
      if (!arr.length) {
        throw new Error('branches (ou branche) requis');
      }
      return true;
    }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const sessionId = req.body.sessionId;
    const niveau = req.body.niveau;
    const centreId = req.body.centreId;
    const nom = normStr(req.body.nom);

    // normaliser branches (array)
    const branches = normArrayStrings(
      Array.isArray(req.body.branches) ? req.body.branches : (req.body.branche ? [req.body.branche] : [])
    );

    // 1) session + branches autorisées
    const s = await Session.findById(sessionId).select('title branches branche').lean();
    if (!s) return res.status(404).json({ error: 'Session introuvable' });

    const rawAllowed = Array.isArray(s.branches) ? s.branches : Array.isArray(s.branche) ? s.branche : [];
    const allowed = normArrayStrings(rawAllowed);

    if (!branches.every(b => allowed.includes(b))) {
      return res.status(400).json({ error: 'Certaines branches ne sont pas autorisées pour cette session' });
    }

    // 2) centre
    const c = await Centre.findById(centreId).select('title region').lean();
    if (!c) return res.status(404).json({ error: 'Centre introuvable' });

    // 3) création
    try {
      const doc = await Formation.create({
        session: sessionId,
        sessionTitleSnapshot: s.title || '',
        niveau,
        centre: centreId,
        centreTitleSnapshot: c.title || '',
        centreRegionSnapshot: c.region || '',
        nom,
        branches, // ⬅️ multi-branches dans le modèle
      });
      return res.status(201).json({ ok: true, id: doc._id });
    } catch (e) {
      if (e?.code === 11000) {
        return res.status(409).json({ error: 'Formation déjà existante pour cette combinaison (session/niveau/centre/nom/branches)' });
      }
      throw e;
    }
  }
);

/** PATCH /api/formations/:id
 *  Optionnellement permet de mettre à jour les branches:
 *   - branches: string[]  ou  branche: string
 */
router.patch(
  '/:id',
  requireAuth,
  [
    param('id').isMongoId(),
    body('niveau').optional().isIn(['تمهيدية', 'شارة خشبية']),
    body('centreId').optional().isMongoId(),
    body('nom').optional().isLength({ min: 2 }).trim(),
    body('branches').optional().isArray({ min: 1 }),
    body('branches.*').optional().isString().trim().notEmpty(),
    body('branche').optional().isString().trim().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { id } = req.params;

    // Charger la formation si besoin pour valider les branches vs session
    const existing = await Formation.findById(id).select('session').lean();
    if (!existing) return res.status(404).json({ error: 'Formation introuvable' });

    const updates = {};
    if (req.body.niveau) updates.niveau = req.body.niveau;
    if (req.body.nom) updates.nom = normStr(req.body.nom);

    if (req.body.centreId) {
      const c = await Centre.findById(req.body.centreId).select('title region').lean();
      if (!c) return res.status(404).json({ error: 'Centre introuvable' });
      updates.centre = c._id;
      updates.centreTitleSnapshot = c.title || '';
      updates.centreRegionSnapshot = c.region || '';
    }

    // Gestion mise à jour des branches
    const patchBranchesRaw = Array.isArray(req.body.branches)
      ? req.body.branches
      : (req.body.branche ? [req.body.branche] : null);

    if (patchBranchesRaw) {
      const newBranches = normArrayStrings(patchBranchesRaw);

      // valider vs session
      const s = await Session.findById(existing.session).select('branches branche').lean();
      const rawAllowed = Array.isArray(s?.branches) ? s.branches : Array.isArray(s?.branche) ? s.branche : [];
      const allowed = normArrayStrings(rawAllowed);

      if (!newBranches.length || !newBranches.every(b => allowed.includes(b))) {
        return res.status(400).json({ error: 'Branches non autorisées pour cette session' });
      }
      updates.branches = newBranches;
    }

    const d = await Formation.findByIdAndUpdate(id, updates, { new: true });
    if (!d) return res.status(404).json({ error: 'Formation introuvable (après mise à jour)' });
    res.json({ ok: true });
  }
);

/** DELETE /api/formations/:id */
router.delete('/:id', requireAuth, [param('id').isMongoId()], async (req, res) => {
  const { id } = req.params;
  await Formation.findByIdAndDelete(id);
  res.status(204).end();
});
router.get(
  '/:id',
  requireAuth,
  [param('id').isMongoId()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { id } = req.params;

    // 1) Formation + centre (snapshot fallback)
    const f = await Formation.findById(id)
      .select('_id session niveau nom branches centre sessionTitleSnapshot centreTitleSnapshot centreRegionSnapshot createdAt')
      .populate({ path: 'centre', select: 'title region _id' })
      .lean();

    if (!f) return res.status(404).json({ error: 'Formation introuvable' });

    // 2) Session (pour récupérer les branches autorisées)
    const s = await Session.findById(f.session)
      .select('title startDate endDate branches branche')
      .lean();

    const rawAllowed = Array.isArray(s?.branches)
      ? s.branches
      : (Array.isArray(s?.branche) ? s.branche : []);
    const allowed = (rawAllowed || [])
      .map(String)
      .map(x => x.trim())
      .filter(Boolean);

    // 3) Payload de sortie
    const out = {
      _id: String(f._id),
      sessionId: String(f.session),
      niveau: f.niveau,
      nom: f.nom,
      branches: Array.isArray(f.branches) ? f.branches : [],
      centre: f.centre
        ? { _id: String(f.centre._id), title: f.centre.title, region: f.centre.region }
        : { _id: null, title: f.centreTitleSnapshot, region: f.centreRegionSnapshot },
      sessionTitle: s?.title || f.sessionTitleSnapshot,
      startDate: s?.startDate || null,
      endDate: s?.endDate || null,
      allowedBranches: allowed,
    };

    return res.json(out);
  }
);

module.exports = router;
