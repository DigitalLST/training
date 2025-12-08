// routes/reports.js
const express = require('express');
const { param, query, body, validationResult } = require('express-validator');
const requireAuth = require('../middlewares/auth');

const FormationAffectation = require('../models/affectation');
const Formation = require('../models/formation');
const FormationReport = require('../models/formationReport');

const router = express.Router();

function bad(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(400).json({ errors: e.array() });
  return null;
}

/**
 * GET /reports/mine-formations
 * => Liste des formations où je peux faire un rapport (director ou coach)
 *    [
 *      {
 *        formationId,
 *        nom,
 *        role: 'director' | 'coach',
 *        sessionTitle,
 *        startDate,
 *        endDate,
 *        centreTitle,
 *        centreRegion,
 *        sessionId
 *      }
 *    ]
 */
router.get('/mine-formations', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const rows = await FormationAffectation.find({
      user: userId,
      role: { $in: ['director', 'coach'] },
    })
      .select('formation role')
      .populate({
        path: 'formation',
        select:
          'nom centre centreTitleSnapshot centreRegionSnapshot session startDate endDate',
        populate: {
          path: 'session',
          select: 'title startDate endDate',
        },
      })
      .lean();

    const out = [];

    for (const row of rows) {
      const f = row.formation;
      if (!f) continue;

      const fid = String(f._id);
      const session = f.session || {};

      let sessionId = undefined;
      if (session && session._id) {
        sessionId = String(session._id);
      } else if (f.session) {
        sessionId = String(f.session);
      }

      out.push({
        formationId: fid,
        nom: f.nom || '',
        role: row.role, // 'director' ou 'coach'
        sessionTitle: session.title || '',
        startDate: (session.startDate || f.startDate) || null,
        endDate: (session.endDate || f.endDate) || null,
        centreTitle: f.centreTitleSnapshot || '',
        centreRegion: f.centreRegionSnapshot || '',
        sessionId,
      });
    }

    return res.json(out);
  } catch (err) {
    console.error('GET /reports/mine-formations ERROR', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /reports/formations/:formationId/my
 * Query:
 *  - role=director|coach (optionnel, mais recommandé)
 *
 * Retourne le rapport existant OU un squelette vide.
 */
router.get(
  '/formations/:formationId/my',
  requireAuth,
  [
    param('formationId').isMongoId(),
    query('role').optional().isIn(['director', 'coach']),
  ],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;

    const { formationId } = req.params;
    const requestedRole = req.query.role; // director | coach | undefined
    const userId = req.user.id;

    // On vérifie que l'utilisateur est bien affecté à cette formation avec le bon rôle
    const affQuery = {
      formation: formationId,
      user: userId,
    };
    if (requestedRole) {
      affQuery.role = requestedRole;
    } else {
      affQuery.role = { $in: ['director', 'coach'] };
    }

    const affectation = await FormationAffectation.findOne(affQuery)
      .select('role')
      .lean();

    if (!affectation) {
      return res
        .status(403)
        .json({ error: 'Vous n’êtes pas autorisé à rédiger un rapport pour cette formation.' });
    }

    const role = requestedRole || affectation.role;

    let report = await FormationReport.findOne({
      formation: formationId,
      user: userId,
      role,
    }).lean();

    if (!report) {
      // on retourne un "squelette" vide, le front le remplira puis POST
      report = {
        formation: formationId,
        user: userId,
        role,
        block1: '',
        block2: '',
        block3: '',
        signedAt: null,
        createdAt: null,
        updatedAt: null,
      };
    }

    // petit flag pour plus tard : si tu as un champ signature sur User, tu peux l’exposer ici
    const hasSignature = false; // TODO: branche sur ton modèle User (signaturePath, etc.)

    return res.json({
      formationId,
      role,
      block1: report.block1 || '',
      block2: report.block2 || '',
      block3: report.block3 || '',
      signedAt: report.signedAt || null,
      updatedAt: report.updatedAt || null,
      hasSignature,
    });
  }
);

/**
 * POST /reports/formations/:formationId/my
 * Body: { block1?, block2?, block3? }
 * Query: role=director|coach (optionnel mais conseillé)
 *
 * Upsert du rapport pour la formation + user + role
 */
router.post(
  '/formations/:formationId/my',
  requireAuth,
  [
    param('formationId').isMongoId(),
    query('role').optional().isIn(['director', 'coach']),
    body('block1').optional().isString(),
    body('block2').optional().isString(),
    body('block3').optional().isString(),
  ],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;

    const { formationId } = req.params;
    const requestedRole = req.query.role;
    const userId = req.user.id;
    const { block1 = '', block2 = '', block3 = '' } = req.body || {};

    // Vérifier affectation
    const affQuery = {
      formation: formationId,
      user: userId,
    };
    if (requestedRole) {
      affQuery.role = requestedRole;
    } else {
      affQuery.role = { $in: ['director', 'coach'] };
    }

    const affectation = await FormationAffectation.findOne(affQuery)
      .select('role')
      .lean();

    if (!affectation) {
      return res
        .status(403)
        .json({ error: 'Vous n’êtes pas autorisé à rédiger un rapport pour cette formation.' });
    }

    const role = requestedRole || affectation.role;

    const now = new Date();

    const report = await FormationReport.findOneAndUpdate(
      {
        formation: formationId,
        user: userId,
        role,
      },
      {
        $set: {
          block1,
          block2,
          block3,
        },
        $setOnInsert: {
          signedAt: null,
        },
      },
      {
        upsert: true,
        new: true,
      }
    ).lean();

    return res.json({
      ok: true,
      report: {
        formationId,
        role,
        block1: report.block1 || '',
        block2: report.block2 || '',
        block3: report.block3 || '',
        signedAt: report.signedAt || null,
        updatedAt: report.updatedAt || now,
      },
    });
  }
);
/**
 * GET /reports/formations/:formationId
 * Query:
 *  - role=director|coach (recommandé)
 *
 * ➜ Retourne le rapport associé à la formation + rôle (le plus récent).
 * Utilisé par le front "moderator" pour VISUALISER le rapport
 * (sans filtrer par user).
 */
router.get(
  '/formations/:formationId',
  requireAuth,
  [
    param('formationId').isMongoId(),
    query('role').optional().isIn(['director', 'coach']),
  ],
  async (req, res) => {
    const e = validationResult(req);
    if (!e.isEmpty()) {
      return res.status(400).json({ errors: e.array() });
    }

    const { formationId } = req.params;
    const role = req.query.role; // 'director' | 'coach' | undefined

    try {
      const q = { formation: formationId };
      if (role) {
        q.role = role;
      }

      // On récupère le rapport le plus récent pour cette formation / rôle
      const report = await FormationReport.findOne(q)
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();

      if (!report) {
        // Pas de rapport : on renvoie un 404 explicite
        return res.status(404).json({
          error: 'Aucun rapport disponible pour cette formation / rôle.',
        });
      }

      const hasSignature = false; // à brancher plus tard sur user.signature si tu veux

      return res.json({
        formationId,
        role: report.role,
        block1: report.block1 || '',
        block2: report.block2 || '',
        block3: report.block3 || '',
        signedAt: report.signedAt || null,
        updatedAt: report.updatedAt || null,
        hasSignature,
      });
    } catch (err) {
      console.error('GET /reports/formations/:formationId ERROR', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);



module.exports = router;
