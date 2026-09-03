// routes/admins.js
const express = require('express');
const { param, body, validationResult } = require('express-validator');

const requireAuth = require('../middlewares/auth');
const User = require('../models/user');
const SignatoryMandate = require('../models/signatoryMandate');
const { createMandate } = require('../services/signatoryMandates');

const router = express.Router();

/* ---------- helpers ---------- */

function bad(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) {
    console.error('Validation errors:', e.array());
    res.status(400).json({ errors: e.array() });
    return true;
  }
  return false;
}

function ensureAdmin(req, res) {
  const u = req.user;
  if (!u || u.role !== 'admin') {
    res.status(403).json({ message: 'Accès réservé aux administrateurs.' });
    return false;
  }
  return true;
}

// adminAccess autorisés côté User
function isValidAdminAccess(v) {
  return ['simple', 'cn_president', 'cn_commissioner'].includes(v);
}

/* ---------- GET /admins ---------- */
router.get('/', requireAuth, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  try {
    const admins = await User.find({ role: 'admin' })
      .select('prenom nom email idScout region role adminAccess')
      .lean();

    if (!admins.length) return res.json([]);

    const userIds = admins.map(a => a._id);

    const mandates = await SignatoryMandate.find({
      user: { $in: userIds },
      type: { $in: ['cn_president', 'cn_commissioner', 'regional_president'] },
    })
      .sort({ startDate: -1 })
      .lean();

    const mandatesByUser = new Map();
    for (const m of mandates) {
      const uid = String(m.user);
      if (!mandatesByUser.has(uid)) mandatesByUser.set(uid, []);
      mandatesByUser.get(uid).push({
        _id: m._id,
        type: m.type,
        region: m.region || null,
        startDate: m.startDate,
        endDate: m.endDate || null,
        titleFr: m.titleFr || null,
        titleEn: m.titleEn || null,
      });
    }

const out = admins.map(a => {
  const uid = String(a._id);
  const userMandates = mandatesByUser.get(uid) || [];

  // Mandats actifs (endDate null)
  const activeMandates = userMandates.filter(m => !m.endDate);

  // On part de la valeur stockée sur l'utilisateur
  let effectiveAdminAccess = a.adminAccess || 'simple';

  // Si l'accès est "simple" mais qu'on a un mandat national actif,
  // on le dérive du mandat
  if (effectiveAdminAccess === 'simple') {
    const national = activeMandates.find(
      m => m.type === 'cn_president' || m.type === 'cn_commissioner'
    );
    if (national) {
      // 'cn_president' ou 'cn_commissioner'
      effectiveAdminAccess = national.type;
    }
  }

  return {
    _id: uid,
    prenom: a.prenom || '',
    nom: a.nom || '',
    email: a.email || '',
    idScout: a.idScout || '',
    region: a.region || '',
    role: a.role,
    adminAccess: effectiveAdminAccess,  // <= on renvoie cette valeur calculée
    mandates: userMandates,
  };
});


    return res.json(out);
  } catch (err) {
    console.error('GET /admins ERROR', err);
    return res
      .status(500)
      .json({ message: 'Erreur serveur lors de la lecture des administrateurs.' });
  }
});

/* ---------- PATCH /admins/:id ---------- */
router.patch(
  '/:id',
  requireAuth,
  [
    param('id').isMongoId(),
    body('makeAdmin').optional().isBoolean(),
    body('adminAccess').optional().isString(),
    body('mandateStartDate').optional().isString(),
  ],
  async (req, res) => {
    if (bad(req, res)) return;
    if (!ensureAdmin(req, res)) return;

    const { id } = req.params;
    let { makeAdmin, adminAccess, mandateStartDate } = req.body;

    try {
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur introuvable.' });
      }

      if (typeof makeAdmin === 'undefined') {
        makeAdmin = true;
      }

      if (makeAdmin) {
        user.role = 'admin';

        if (adminAccess && isValidAdminAccess(adminAccess)) {
          user.adminAccess = adminAccess;
        } else if (!user.adminAccess) {
          user.adminAccess = 'simple';
        }
      } else {
        user.role = 'user';
        user.adminAccess = undefined;
      }

      await user.save();

      let newMandate = null;

      if (
        makeAdmin &&
        adminAccess &&
        adminAccess !== 'simple' &&
        mandateStartDate
      ) {
        const type =
          adminAccess === 'cn_president'
            ? 'cn_president'
            : 'cn_commissioner';

        newMandate = await createMandate({
          userId: user._id,
          type,
          startDate: mandateStartDate,
        });
      }

      const mandates = await SignatoryMandate.find({
        user: user._id,
        type: { $in: ['cn_president', 'cn_commissioner', 'regional_president'] },
      })
        .sort({ startDate: -1 })
        .lean();

      return res.json({
        user: {
          _id: user._id,
          prenom: user.prenom,
          nom: user.nom,
          email: user.email,
          idScout: user.idScout,
          region: user.region,
          role: user.role,
          adminAccess: user.adminAccess || 'simple',
        },
        mandates: mandates.map(m => ({
          _id: m._id,
          type: m.type,
          region: m.region || null,
          startDate: m.startDate,
          endDate: m.endDate || null,
          titleFr: m.titleFr || null,
          titleEn: m.titleEn || null,
        })),
        createdMandate: newMandate
          ? {
              _id: newMandate._id,
              type: newMandate.type,
              region: newMandate.region || null,
              startDate: newMandate.startDate,
              endDate: newMandate.endDate || null,
              titleFr: newMandate.titleFr || null,
              titleEn: newMandate.titleEn || null,
            }
          : null,
      });
    } catch (err) {
      console.error('PATCH /admins/:id ERROR', err);
      return res
        .status(500)
        .json({ message: 'Erreur serveur lors de la mise à jour de l’administrateur.' });
    }
  }
);

/* ---------- DELETE /admins/:id ---------- */
router.delete(
  '/:id',
  requireAuth,
  [param('id').isMongoId()],
  async (req, res) => {
    if (bad(req, res)) return;
    if (!ensureAdmin(req, res)) return;

    const { id } = req.params;

    try {
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur introuvable.' });
      }

      // 1) On enlève le rôle admin
      user.role = 'user';
      user.adminAccess = undefined;
      await user.save();

      // 2) On clôture tous ses mandats actifs (endDate: null)
      const now = new Date();
      await SignatoryMandate.updateMany(
        { user: user._id, endDate: null },
        { $set: { endDate: now } }
      );

      return res.json({
        ok: true,
        user: {
          _id: user._id,
          prenom: user.prenom,
          nom: user.nom,
          email: user.email,
          idScout: user.idScout,
          region: user.region,
          role: user.role,
          adminAccess: user.adminAccess || null,
        },
      });
    } catch (err) {
      console.error('DELETE /admins/:id ERROR', err);
      return res
        .status(500)
        .json({ message: 'Erreur serveur lors de la suppression de l’administrateur.' });
    }
  }
);

/* ---------- POST /admins/:id/mandates ---------- */
/**
 * Création explicite d'un mandat signataire
 * - Met automatiquement l'utilisateur en admin si ce n'est pas le cas
 * - Met à jour adminAccess pour les mandats nationaux
 */
router.post(
  '/:id/mandates',
  requireAuth,
  [
    param('id').isMongoId(),
  ],
  async (req, res) => {
    if (bad(req, res)) return;
    if (!ensureAdmin(req, res)) return;

    const { id } = req.params;
    const { type, startDate, region, titleFr, titleEn } = req.body || {};

    try {
      // --- validation MANUELLE du body ---
      const allowedTypes = ['cn_president', 'cn_commissioner', 'regional_president'];

      if (!type || !allowedTypes.includes(type)) {
        return res.status(400).json({
          message: 'Type de mandat invalide. Valeurs autorisées: cn_president, cn_commissioner, regional_president.',
        });
      }

      if (!startDate || typeof startDate !== 'string') {
        return res.status(400).json({
          message: 'La date de début du mandat (startDate) est obligatoire (format YYYY-MM-DD).',
        });
      }

      if (type === 'regional_president' && !region) {
        return res.status(400).json({
          message: 'La région est obligatoire pour un mandat régional.',
        });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur introuvable.' });
      }

      // 👉 Ton besoin : création de mandat = promotion auto en admin
      if (user.role !== 'admin') {
        user.role = 'admin';
      }

      // Mettre adminAccess en cohérence avec le type de mandat
      if (type === 'cn_president') {
        user.adminAccess = 'cn_president';
      } else if (type === 'cn_commissioner') {
        user.adminAccess = 'cn_commissioner';
      } else {
        // mandat régional → si pas encore de adminAccess, on met simple
        if (!user.adminAccess) {
          user.adminAccess = 'simple';
        }
      }

      await user.save();

      // Création / update de mandat via le service
      const mandate = await createMandate({
        userId: user._id,
        type,
        region: type === 'regional_president' ? region : undefined,
        startDate, // string 'YYYY-MM-DD'
      });

      // On applique les titres FR/EN si fournis
      if (titleFr || titleEn) {
        if (titleFr) mandate.titleFr = titleFr;
        if (titleEn) mandate.titleEn = titleEn;
        await mandate.save();
      }

      const mandates = await SignatoryMandate.find({
        user: user._id,
      })
        .sort({ startDate: -1 })
        .lean();

      return res.json({
        user: {
          _id: user._id,
          prenom: user.prenom,
          nom: user.nom,
          email: user.email,
          idScout: user.idScout,
          region: user.region,
          role: user.role,
          adminAccess: user.adminAccess || 'simple',
        },
        createdMandate: {
          _id: mandate._id,
          type: mandate.type,
          region: mandate.region || null,
          startDate: mandate.startDate,
          endDate: mandate.endDate || null,
          titleFr: mandate.titleFr || null,
          titleEn: mandate.titleEn || null,
        },
        mandates: mandates.map(m => ({
          _id: m._id,
          type: m.type,
          region: m.region || null,
          startDate: m.startDate,
          endDate: m.endDate || null,
          titleFr: m.titleFr || null,
          titleEn: m.titleEn || null,
        })),
      });
    } catch (err) {
      console.error('POST /admins/:id/mandates ERROR', err);
      return res
        .status(500)
        .json({ message: 'Erreur serveur lors de la création du mandat.' });
    }
  }
);

module.exports = router;
