const express = require('express');
const { param, body, validationResult } = require('express-validator');

const requireAuth = require('../middlewares/auth');
const User = require('../models/user');
const Demande = require('../models/demande');

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

/* ---------- GET /admin/demandes/users/:userId ---------- */

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
      const user = await User.findById(userId).select('_id prenom nom email idScout region');

      if (!user) {
        return res.status(404).json({ message: 'Utilisateur introuvable.' });
      }

      const demandes = await Demande.find({ applicant: userId })
        .populate('session', 'title startDate endDate organizer')
        .sort({ createdAt: -1 })
        .lean();

      return res.json(
        demandes.map(d => ({
          _id: d._id,
          sessionId: d.session?._id || '',
          sessionTitle: d.session?.title || '',
          startDate: d.session?.startDate || null,
          endDate: d.session?.endDate || null,
          organizer: d.session?.organizer || '',
          trainingLevel: d.trainingLevel || '',
          branche: d.branche || '',
          statusRegion: d.statusRegion || 'PENDING',
          statusNational: d.statusNational || 'PENDING',
          applicantSnapshot: {
            idScout: d.applicantSnapshot?.idScout || user.idScout || '',
            firstName: d.applicantSnapshot?.firstName || user.prenom || '',
            lastName: d.applicantSnapshot?.lastName || user.nom || '',
            email: d.applicantSnapshot?.email || user.email || '',
            region: d.applicantSnapshot?.region || user.region || '',
          },
        }))
      );
    } catch (err) {
      console.error('GET /admin/demandes/users/:userId ERROR', err);
      return res.status(500).json({
        message: 'Erreur serveur lors de la lecture des demandes.',
      });
    }
  }
);

/* ---------- PATCH /admin/demandes/:id ----------
 * 2 niveaux d'update :
 * 1) applicantSnapshot :
 *    - update User
 *    - update applicantSnapshot sur toutes les demandes du même applicant
 *
 * 2) Infos propres à la demande :
 *    - trainingLevel
 *    - branche
 *    - statusRegion
 *    - statusNational
 *    => update uniquement sur la demande courante
 */

router.patch(
  '/:id',
  requireAuth,
  [
    param('id').isMongoId(),

    body('trainingLevel').optional().isString(),
    body('branche').optional().isString(),
    body('statusRegion').optional().isIn(['PENDING', 'APPROVED', 'REJECTED']),
    body('statusNational').optional().isIn(['PENDING', 'APPROVED', 'REJECTED']),

    body('applicantSnapshot').optional().isObject(),
    body('applicantSnapshot.idScout').optional().isString(),
    body('applicantSnapshot.firstName').optional().isString(),
    body('applicantSnapshot.lastName').optional().isString(),
    body('applicantSnapshot.email').optional().isEmail(),
    body('applicantSnapshot.region').optional().isString(),
  ],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;
    if (!ensureAdmin(req, res)) return;

    try {
      const demande = await Demande.findById(req.params.id);

      if (!demande) {
        return res.status(404).json({ message: 'Demande introuvable.' });
      }

      const demandeOnlyUpdate = {};
      const snapshotUpdate = {};
      const userUpdate = {};

      if (req.body.trainingLevel !== undefined) {
        demandeOnlyUpdate.trainingLevel = req.body.trainingLevel.trim();
      }

      if (req.body.branche !== undefined) {
        demandeOnlyUpdate.branche = req.body.branche.trim();
      }

      if (req.body.statusRegion !== undefined) {
        demandeOnlyUpdate.statusRegion = req.body.statusRegion;
      }

      if (req.body.statusNational !== undefined) {
        demandeOnlyUpdate.statusNational = req.body.statusNational;
      }

      if (req.body.applicantSnapshot) {
        const s = req.body.applicantSnapshot;

        if (s.idScout !== undefined) {
          const v = s.idScout.trim();
          snapshotUpdate['applicantSnapshot.idScout'] = v;
          userUpdate.idScout = v;
        }

        if (s.firstName !== undefined) {
          const v = s.firstName.trim();
          snapshotUpdate['applicantSnapshot.firstName'] = v;
          userUpdate.prenom = v;
        }

        if (s.lastName !== undefined) {
          const v = s.lastName.trim();
          snapshotUpdate['applicantSnapshot.lastName'] = v;
          userUpdate.nom = v;
        }

        if (s.email !== undefined) {
          const v = s.email.trim().toLowerCase();
          snapshotUpdate['applicantSnapshot.email'] = v;
          userUpdate.email = v;
        }

        if (s.region !== undefined) {
          const v = s.region.trim();
          snapshotUpdate['applicantSnapshot.region'] = v;
          userUpdate.region = v;
        }
      }

      if (Object.keys(userUpdate).length > 0) {
        const user = await User.findByIdAndUpdate(
          demande.applicant,
          { $set: userUpdate },
          { new: true, runValidators: true }
        );

        if (!user) {
          return res.status(404).json({
            message: 'Utilisateur lié à la demande introuvable.',
          });
        }
      }

      if (Object.keys(snapshotUpdate).length > 0) {
        await Demande.updateMany(
          { applicant: demande.applicant },
          { $set: snapshotUpdate },
          { runValidators: true }
        );
      }

      if (Object.keys(demandeOnlyUpdate).length > 0) {
        await Demande.findByIdAndUpdate(
          req.params.id,
          { $set: demandeOnlyUpdate },
          { runValidators: true }
        );
      }

      const updatedDemande = await Demande.findById(req.params.id)
        .populate('session', 'title startDate endDate organizer')
        .lean();

      return res.json({
        ok: true,
        demande: {
          _id: updatedDemande._id,
          sessionId: updatedDemande.session?._id || '',
          sessionTitle: updatedDemande.session?.title || '',
          startDate: updatedDemande.session?.startDate || null,
          endDate: updatedDemande.session?.endDate || null,
          organizer: updatedDemande.session?.organizer || '',
          trainingLevel: updatedDemande.trainingLevel || '',
          branche: updatedDemande.branche || '',
          statusRegion: updatedDemande.statusRegion || 'PENDING',
          statusNational: updatedDemande.statusNational || 'PENDING',
          applicantSnapshot: {
            idScout: updatedDemande.applicantSnapshot?.idScout || '',
            firstName: updatedDemande.applicantSnapshot?.firstName || '',
            lastName: updatedDemande.applicantSnapshot?.lastName || '',
            email: updatedDemande.applicantSnapshot?.email || '',
            region: updatedDemande.applicantSnapshot?.region || '',
          },
        },
      });
    } catch (err) {
      console.error('PATCH /admin/demandes/:id ERROR', err);

      if (err.code === 11000) {
        return res.status(409).json({
          message: 'Email ou identifiant scout déjà utilisé.',
        });
      }

      return res.status(500).json({
        message: 'Erreur serveur lors de la mise à jour de la demande.',
      });
    }
  }
);

/* ---------- DELETE /admin/demandes/:id ---------- */

router.delete(
  '/:id',
  requireAuth,
  [param('id').isMongoId()],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;
    if (!ensureAdmin(req, res)) return;

    try {
      const demande = await Demande.findByIdAndDelete(req.params.id);

      if (!demande) {
        return res.status(404).json({ message: 'Demande introuvable.' });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /admin/demandes/:id ERROR', err);
      return res.status(500).json({
        message: 'Erreur serveur lors de la suppression de la demande.',
      });
    }
  }
);

module.exports = router;