const express = require('express');
const { param, body, validationResult } = require('express-validator');

const requireAuth = require('../middlewares/auth');
const User = require('../models/user');
const SessionAffectation = require('../models/affectation');
const Evaluation = require('../models/evaluation');
const FinalDecision = require('../models/finalDecision');

const router = express.Router();

function bad(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(400).json({ errors: e.array() });
  return null;
}

function ensureAdmin(req, res) {
  const u = req.user;
  if (!u || u.role !== 'admin') {
    res.status(403).json({ message: 'Accès réservé aux administrateurs.' });
    return false;
  }
  return true;
}

/* GET /admin/affectations/users/:userId */
router.get(
  '/users/:userId',
  requireAuth,
  [param('userId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;
    if (!ensureAdmin(req, res)) return;

    try {
      const user = await User.findById(req.params.userId).select('_id');
      if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });

      const affectations = await SessionAffectation.find({ user: req.params.userId })
        .populate(
          'formation',
          'nom niveau sessionTitleSnapshot centreTitleSnapshot centreRegionSnapshot'
        )
        .sort({ createdAt: -1 })
        .lean();

      return res.json(
        affectations.map(a => ({
          _id: a._id,
          formationId: a.formation?._id || '',
          formationName: a.formation?.nom || '',
          niveau: a.formation?.niveau || '',
          sessionTitle: a.formation?.sessionTitleSnapshot || '',
          centreTitle: a.formation?.centreTitleSnapshot || '',
          centreRegion: a.formation?.centreRegionSnapshot || '',
          role: a.role,
          isPresent: !!a.isPresent,
        }))
      );
    } catch (err) {
      console.error('GET /admin/affectations/users/:userId ERROR', err);
      return res.status(500).json({
        message: 'Erreur serveur lors de la lecture des affectations.',
      });
    }
  }
);

/* PATCH /admin/affectations/:id */
router.patch(
  '/:id',
  requireAuth,
  [
    param('id').isMongoId(),
    body('role').optional().isIn(['director', 'trainer', 'trainee', 'coach', 'assistant']),
    body('isPresent').optional().isBoolean(),
  ],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;
    if (!ensureAdmin(req, res)) return;

    try {
      const update = {};

      if (req.body.role !== undefined) update.role = req.body.role;
      if (req.body.isPresent !== undefined) update.isPresent = req.body.isPresent;

      const affectation = await SessionAffectation.findByIdAndUpdate(
        req.params.id,
        { $set: update },
        { new: true, runValidators: true }
      );

      if (!affectation) {
        return res.status(404).json({ message: 'Affectation introuvable.' });
      }

      return res.json({ ok: true, affectation });
    } catch (err) {
      console.error('PATCH /admin/affectations/:id ERROR', err);

      if (err.code === 11000) {
        return res.status(409).json({
          message: 'Ce membre possède déjà une affectation sur cette formation.',
        });
      }

      return res.status(500).json({
        message: 'Erreur serveur lors de la mise à jour de l’affectation.',
      });
    }
  }
);

/* DELETE /admin/affectations/:id */
router.delete(
  '/:id',
  requireAuth,
  [param('id').isMongoId()],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;
    if (!ensureAdmin(req, res)) return;

    try {
      const affectation = await SessionAffectation.findById(req.params.id);
      if (!affectation) {
        return res.status(404).json({ message: 'Affectation introuvable.' });
      }

      const hasEvaluation = await Evaluation.exists({ affectation: affectation._id });
      const hasFinalDecision = await FinalDecision.exists({ affectation: affectation._id });

      if (hasEvaluation || hasFinalDecision) {
        return res.status(409).json({
          message: 'Impossible de supprimer cette affectation car elle est liée à une évaluation ou une décision finale.',
        });
      }

      await SessionAffectation.findByIdAndDelete(affectation._id);

      return res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /admin/affectations/:id ERROR', err);
      return res.status(500).json({
        message: 'Erreur serveur lors de la suppression de l’affectation.',
      });
    }
  }
);

module.exports = router;