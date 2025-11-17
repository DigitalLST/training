// routes/moderators.js
const express = require('express');
const { param, body, validationResult } = require('express-validator');
const requireAuth = require('../middlewares/auth');
const { requireModeratorNational } = require('../middlewares/role');
const User = require('../models/user');

const NATIONAL = 'وطني';
const norm = s => (s || '').trim();
const router = express.Router();

router.use(requireAuth, requireModeratorNational);

/** GET /api/moderators
 *  (optionnel) ?region=...
 *  -> sans pages, sans limit
 */
router.get('/', async (req, res) => {
  const region = norm(req.query.region);
  const filter = { role: 'moderator', ...(region ? { region } : {}) };

  // Renvoie seulement ce qui t'intéresse pour l’UI
  const items = await User.find(filter)
    .select('nom prenom region email niveau role createdAt updatedAt')
    .sort({ region: 1, nom: 1, prenom: 1 })
    .lean();

  res.json(items);
});

/** PATCH /api/moderators/:id
 *  Promouvoir/mettre à jour un utilisateur en "moderator" + region
 *  Body: { region: "Sousse" | "وطني" }
 */
router.patch(
  '/:id',
  [ param('id').isMongoId(), body('region').isString().trim().isLength({ min: 1 }) ],
  async (req, res) => {
    const e = validationResult(req);
    if (!e.isEmpty()) return res.status(400).json({ errors: e.array() });

    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (u.role === 'admin') return res.status(400).json({ error: 'Impossible de modifier un admin.' });

    const region = norm(req.body.region);
    u.role = 'moderator';
    u.region = region; // "وطني" => national, sinon régional
    await u.save();

    res.json({ ok: true, user: u.toJSON() });
  }
);

/** DELETE /api/moderators/:id
 *  Rétrograder en "user"
 */
router.delete(
  '/:id',
  [ param('id').isMongoId() ],
  async (req, res) => {
    const e = validationResult(req);
    if (!e.isEmpty()) return res.status(400).json({ errors: e.array() });

    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (u.role !== 'moderator') return res.status(400).json({ error: "L'utilisateur n'est pas modérateur." });

    u.role = 'user';
    await u.save();

    res.json({ ok: true, user: u.toJSON() });
  }
);

module.exports = router;
