// routes/adminEvaluations.js
const express = require('express');
const { param, body, validationResult } = require('express-validator');

const requireAuth = require('../middlewares/auth');
const User = require('../models/user');
const Formation = require('../models/formation');
const Evaluation = require('../models/evaluation');
const FinalDecision = require('../models/finalDecision');
const Critere = require('../models/critere'); // adapte le chemin si besoin

const router = express.Router();

/* ---------- helpers ---------- */

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

/* ---------- GET /admin/evaluations/users/:userId ----------
 * Liste des formations/sessions pour lesquelles ce user a une Evaluation
 * + FinalDecision éventuelle
 */
router.get(
  '/users/:userId',
  requireAuth,
  [param('userId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;
    if (!ensureAdmin(req, res)) return;

    const { userId } = req.params;

    try {
      const user = await User.findById(userId).select('prenom nom email idScout');
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur introuvable.' });
      }

      const evals = await Evaluation.find({ trainee: userId })
        .populate('formation', 'nom niveau sessionTitleSnapshot centreTitleSnapshot centreRegionSnapshot')
        .lean();

      if (!evals.length) return res.json([]);

      const formationIds = evals.map(ev => ev.formation && ev.formation._id).filter(Boolean);

      const finals = await FinalDecision.find({
        trainee: userId,
        formation: { $in: formationIds },
      }).lean();

      const finalByFormation = new Map();
      for (const fd of finals) {
        finalByFormation.set(String(fd.formation), fd);
      }

      const out = evals.map(ev => {
        const f = ev.formation || {};
        const fd = finalByFormation.get(String(f._id)) || null;
        return {
          formationId: String(f._id),
          formationName: f.nom || '',
          niveau: f.niveau || '',
          sessionTitle: f.sessionTitleSnapshot || '',
          centreTitle: f.centreTitleSnapshot || '',
          centreRegion: f.centreRegionSnapshot || '',
          totalNote: fd ? fd.totalNote : null,
          totalMax: fd ? fd.totalMax : null,
          decision: fd ? fd.decision : null,
        };
      });

      return res.json(out);
    } catch (err) {
      console.error('GET /admin/evaluations/users/:userId ERROR', err);
      return res
        .status(500)
        .json({ message: 'Erreur serveur lors de la lecture des évaluations.' });
    }
  }
);

/* ---------- GET /admin/evaluations/users/:userId/formations/:formationId ----------
 * Détail : critères + notes + finalDecision
 */
router.get(
  '/users/:userId/formations/:formationId',
  requireAuth,
  [param('userId').isMongoId(), param('formationId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;
    if (!ensureAdmin(req, res)) return;

    const { userId, formationId } = req.params;

    try {
      const user = await User.findById(userId).select('prenom nom email idScout region');
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur introuvable.' });
      }

      const formation = await Formation.findById(formationId).lean();
      if (!formation) {
        return res.status(404).json({ message: 'Formation introuvable.' });
      }

      const evaluation = await Evaluation.findOne({
        trainee: userId,
        formation: formationId,
      }).lean();

      if (!evaluation) {
        return res.status(404).json({ message: 'Aucune évaluation trouvée pour ce couple utilisateur/formation.' });
      }

      const finalDecision = await FinalDecision.findOne({
        trainee: userId,
        formation: formationId,
      }).lean();

      // critères = session + niveau
      const criteres = await Critere.find({
        session: evaluation.session,
        niveau: formation.niveau,
      })
        .sort({ famille: 1, rank: 1, critere: 1 })
        .lean();

      const noteByCritere = new Map();
      for (const it of evaluation.items || []) {
        if (it.critere) {
          noteByCritere.set(String(it.critere), it.note);
        }
      }

      const items = criteres.map(c => ({
        critereId: String(c._id),
        famille: c.famille || '',
        label: c.critere || '',
        maxnote: c.maxnote || 0,
        note: typeof noteByCritere.get(String(c._id)) === 'number'
          ? noteByCritere.get(String(c._id))
          : null,
      }));

      const totalMax = items.reduce((acc, it) => acc + (it.maxnote || 0), 0);
      const totalNote = items.reduce(
        (acc, it) => acc + (typeof it.note === 'number' ? it.note : 0),
        0
      );

      const outFinal = finalDecision
        ? {
            _id: finalDecision._id,
            totalNote: finalDecision.totalNote,
            totalMax: finalDecision.totalMax,
            decision: finalDecision.decision,
            status: finalDecision.status,
          }
        : {
            totalNote,
            totalMax,
            decision: null,
            status: 'draft',
          };

      return res.json({
        formation: {
          _id: formation._id,
          nom: formation.nom,
          niveau: formation.niveau,
          sessionTitle: formation.sessionTitleSnapshot || '',
          centreTitle: formation.centreTitleSnapshot || '',
          centreRegion: formation.centreRegionSnapshot || '',
        },
        trainee: {
          _id: user._id,
          prenom: user.prenom,
          nom: user.nom,
          email: user.email,
          idScout: user.idScout,
          region: user.region,
        },
        evaluation: evaluation
          ? {
              _id: evaluation._id,
              status: evaluation.status,
            }
          : null,
        items,
        finalDecision: outFinal,
      });
    } catch (err) {
      console.error(
        'GET /admin/evaluations/users/:userId/formations/:formationId ERROR',
        err
      );
      return res
        .status(500)
        .json({ message: 'Erreur serveur lors de la lecture du détail de l’évaluation.' });
    }
  }
);

/* ---------- PATCH /admin/evaluations/users/:userId/formations/:formationId ----------
 * Body: { items: [{critere, note}], decision?: 'success'|'retake'|'incompatible'|null }
 * Met à jour Evaluation.items + FinalDecision (totaux + décision)
 * et remet les workflows en "draft" (approvals vidées).
 */
router.patch(
  '/users/:userId/formations/:formationId',
  requireAuth,
  [
    param('userId').isMongoId(),
    param('formationId').isMongoId(),
    body('items').isArray({ min: 1 }),
    body('items.*.critere').isMongoId(),
    body('items.*.note').optional().isNumeric(),
    body('decision')
      .optional({ nullable: true })
      .isIn(['success', 'retake', 'incompatible', null]),
  ],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;
    if (!ensureAdmin(req, res)) return;

    const { userId, formationId } = req.params;
    const { items, decision } = req.body;

    try {
      const user = await User.findById(userId).select('_id');
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur introuvable.' });
      }

      const formation = await Formation.findById(formationId).lean();
      if (!formation) {
        return res.status(404).json({ message: 'Formation introuvable.' });
      }

      const evaluation = await Evaluation.findOne({
        trainee: userId,
        formation: formationId,
      });
      if (!evaluation) {
        return res.status(404).json({ message: 'Aucune évaluation trouvée pour ce couple utilisateur/formation.' });
      }

      // map des notes envoyées
      const noteByCritere = new Map();
      for (const it of items) {
        noteByCritere.set(String(it.critere), it.note);
      }

      // mise à jour des items existants
      for (const it of evaluation.items || []) {
        const key = String(it.critere);
        if (noteByCritere.has(key)) {
          const n = noteByCritere.get(key);
          it.note = typeof n === 'number' ? n : null;
        }
      }

      // recalcul totaux
      const totalMax = (evaluation.items || []).reduce(
        (acc, it) => acc + (it.maxnote || 0),
        0
      );
      const totalNote = (evaluation.items || []).reduce(
        (acc, it) => acc + (typeof it.note === 'number' ? it.note : 0),
        0
      );

      // reset workflow evaluation
      evaluation.status = 'draft';
      evaluation.approvals = [];
      evaluation.validatedBy = null;
      evaluation.validatedAt = null;
      await evaluation.save();

      // FinalDecision : upsert
      let finalDecision = await FinalDecision.findOne({
        trainee: userId,
        formation: formationId,
      });

      if (!finalDecision) {
        finalDecision = new FinalDecision({
          session: evaluation.session,
          formation: evaluation.formation,
          trainee: evaluation.trainee,
          affectation: evaluation.affectation,
          totalNote,
          totalMax,
          decision: typeof decision === 'string' ? decision : null,
          status: 'draft',
          approvals: [],
        });
      } else {
        finalDecision.totalNote = totalNote;
        finalDecision.totalMax = totalMax;
        if (typeof decision === 'string' || decision === null) {
          finalDecision.decision = decision;
        }
        finalDecision.status = 'draft';
        finalDecision.approvals = [];
      }

      await finalDecision.save();

      // on renvoie le détail comme le GET détail
      const criteres = await Critere.find({
        session: evaluation.session,
        niveau: formation.niveau,
      })
        .sort({ famille: 1, rank: 1, critere: 1 })
        .lean();

      const noteMap = new Map();
      for (const it of evaluation.items || []) {
        if (it.critere) noteMap.set(String(it.critere), it.note);
      }

      const itemsOut = criteres.map(c => ({
        critereId: String(c._id),
        famille: c.famille || '',
        label: c.critere || '',
        maxnote: c.maxnote || 0,
        note: typeof noteMap.get(String(c._id)) === 'number'
          ? noteMap.get(String(c._id))
          : null,
      }));

      return res.json({
        formation: {
          _id: formation._id,
          nom: formation.nom,
          niveau: formation.niveau,
          sessionTitle: formation.sessionTitleSnapshot || '',
          centreTitle: formation.centreTitleSnapshot || '',
          centreRegion: formation.centreRegionSnapshot || '',
        },
        trainee: {
          _id: user._id,
          prenom: user.prenom,
          nom: user.nom,
          email: user.email,
          idScout: user.idScout,
          region: user.region,
        },
        evaluation: {
          _id: evaluation._id,
          status: evaluation.status,
        },
        items: itemsOut,
        finalDecision: {
          _id: finalDecision._id,
          totalNote: finalDecision.totalNote,
          totalMax: finalDecision.totalMax,
          decision: finalDecision.decision,
          status: finalDecision.status,
        },
      });
    } catch (err) {
      console.error(
        'PATCH /admin/evaluations/users/:userId/formations/:formationId ERROR',
        err
      );
      return res
        .status(500)
        .json({ message: 'Erreur serveur lors de la mise à jour de l’évaluation.' });
    }
  }
);


module.exports = router;
