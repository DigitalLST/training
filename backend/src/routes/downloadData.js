const express = require('express');
const mongoose = require('mongoose');

const { param, validationResult } = require('express-validator');
const { ZipArchive } = require('archiver');


const requireAuth = require('../middlewares/auth');

const Session = require('../models/session');
const Formation = require('../models/formation');
const SessionAffectation = require('../models/affectation');

const {
  generateFormationTraineesPdf,
} = require('../services/pdf');
const archiver = require('archiver');

const router = express.Router();

/**
 * Nettoie un nom pour pouvoir l’utiliser comme nom de fichier.
 */
function sanitizeFileName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function formatZipDate(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

/**
 * GET /api/download-data/sessions/:sessionId/trainees.zip
 *
 * Génère un ZIP contenant :
 * - un PDF par formation de la session ;
 * - uniquement les personnes affectées avec role = trainee ;
 * - idScout, nom, prénom, email et région.
 */
router.get(
  '/sessions/:sessionId/trainees.zip',
  requireAuth,
  [param('sessionId').isMongoId().withMessage('sessionId invalide')],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Paramètres invalides',
        details: errors.array(),
      });
    }

    const { sessionId } = req.params;

    try {
      const session = await Session.findById(sessionId)
        .select('_id title startDate endDate')
        .lean();

      if (!session) {
        return res.status(404).json({
          error: 'Session introuvable',
        });
      }

      const formations = await Formation.find({
        session: new mongoose.Types.ObjectId(sessionId),
      })
        .select(
          '_id session niveau nom branches centre centreTitleSnapshot centreRegionSnapshot'
        )
        .populate({
          path: 'centre',
          select: '_id title region',
        })
        .sort({
          niveau: 1,
          nom: 1,
        })
        .lean();

      if (!formations.length) {
        return res.status(404).json({
          error: 'Aucune formation trouvée pour cette session',
        });
      }

      const formationIds = formations.map((formation) => formation._id);

      /*
       * On récupère toutes les affectations trainee en une seule requête,
       * au lieu de faire une requête MongoDB par formation.
       */
      const affectations = await SessionAffectation.find({
        formation: { $in: formationIds },
        role: 'trainee',
      })
        .select('_id formation user role')
        .populate({
          path: 'user',
          select: '_id idScout nom prenom email region',
        })
        .lean();

      /*
       * Regroupement des trainees par formation.
       */
      const traineesByFormation = new Map();

      for (const affectation of affectations) {
        if (!affectation.formation || !affectation.user) {
          continue;
        }

        const formationId = String(affectation.formation);

        if (!traineesByFormation.has(formationId)) {
          traineesByFormation.set(formationId, []);
        }

        traineesByFormation.get(formationId).push({
          idScout: affectation.user.idScout || '',
          nom: affectation.user.nom || '',
          prenom: affectation.user.prenom || '',
          email: affectation.user.email || '',
          region: affectation.user.region || '',
        });
      }

      const safeSessionTitle =
        sanitizeFileName(session.title) || `session-${sessionId}`;

      const zipFileName =
        `قوائم-المتدربين-${safeSessionTitle}-${formatZipDate(session.startDate)}.zip`;

      res.status(200);
      res.setHeader('Content-Type', 'application/zip');

      /*
       * filename* permet de conserver correctement les caractères arabes.
       */
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="trainees-${sessionId}.zip"; filename*=UTF-8''${encodeURIComponent(
          zipFileName
        )}`
      );

      res.setHeader('Cache-Control', 'no-store, max-age=0');

      const archive = ZipArchive('zip', {
        zlib: {
          level: 9,
        },
      });

      archive.on('warning', (error) => {
        console.warn('ZIP WARNING:', error);
      });

      archive.on('error', (error) => {
        console.error('ZIP ERROR:', error);

        /*
         * Si les headers n’ont pas encore été envoyés,
         * on peut encore retourner du JSON.
         */
        if (!res.headersSent) {
          return res.status(500).json({
            error: 'Erreur pendant la génération du ZIP',
          });
        }

        res.destroy(error);
      });

      archive.pipe(res);

      /*
       * Génération séquentielle :
       * évite de lancer plusieurs Chromium en parallèle sur Render.
       */
      for (let index = 0; index < formations.length; index += 1) {
        const formation = formations[index];

        const trainees =
          traineesByFormation.get(String(formation._id)) || [];

        trainees.sort((a, b) => {
          const regionComparison = String(a.region || '').localeCompare(
            String(b.region || ''),
            'ar',
            { sensitivity: 'base' }
          );

          if (regionComparison !== 0) {
            return regionComparison;
          }

          const nameComparison = String(a.nom || '').localeCompare(
            String(b.nom || ''),
            'ar',
            { sensitivity: 'base' }
          );

          if (nameComparison !== 0) {
            return nameComparison;
          }

          return String(a.prenom || '').localeCompare(
            String(b.prenom || ''),
            'ar',
            { sensitivity: 'base' }
          );
        });

        const centreTitle =
          formation.centre?.title ||
          formation.centreTitleSnapshot ||
          '';

        const centreRegion =
          formation.centre?.region ||
          formation.centreRegionSnapshot ||
          '';

        const pdfData = {
          session: {
            _id: String(session._id),
            title: session.title || '',
            startDate: session.startDate || null,
            endDate: session.endDate || null,
          },

          formation: {
            _id: String(formation._id),
            nom: formation.nom || '',
            niveau: formation.niveau || '',
            branches: Array.isArray(formation.branches)
              ? formation.branches
              : [],
            centreTitle,
            centreRegion,
          },

          trainees,
        };

        const pdfBuffer = await generateFormationTraineesPdf(pdfData);

        const safeFormationName =
          sanitizeFileName(formation.nom) ||
          `formation-${index + 1}`;

        const safeLevel =
          sanitizeFileName(formation.niveau) ||
          'niveau';

        const pdfFileName =
          `${String(index + 1).padStart(2, '0')}` +
          ` - ${safeFormationName}` +
          ` - ${safeLevel}.pdf`;

        archive.append(pdfBuffer, {
          name: pdfFileName,
        });
      }

      await archive.finalize();
    } catch (error) {
      console.error(
        'GET /download-data/sessions/:sessionId/trainees.zip ERROR:',
        error
      );

      if (!res.headersSent) {
        return res.status(500).json({
          error: 'Erreur lors de la génération des listes de stagiaires',
          details:
            process.env.NODE_ENV === 'development'
              ? error.message
              : undefined,
        });
      }

      res.destroy(error);
    }
  }
);

module.exports = router;