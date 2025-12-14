// routes/evaluation.js
const express = require('express');
const { body, param, validationResult } = require('express-validator');

const requireAuth = require('../middlewares/auth');
const Evaluation = require('../models/evaluation');
const SessionAffectation = require('../models/affectation');
const Formation = require('../models/formation');
const FinalDecision = require('../models/finalDecision');

const router = express.Router();

function bad(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(400).json({ errors: e.array() });
  return null;
}

// petite fonction util pour calculer les totaux depuis Evaluation.items
function computeTotals(ev) {
  if (!ev || !Array.isArray(ev.items)) {
    return { totalNote: 0, totalMax: 0 };
  }
  const totalMax = ev.items.reduce(
    (sum, it) => sum + (Number(it.maxnote) || 0),
    0
  );
  const totalNote = ev.items.reduce(
    (sum, it) => sum + (Number(it.note) || 0),
    0
  );
  return { totalNote, totalMax };
}

// Initialise les FinalDecision pour une formation/session donnée
async function initFinalDecisionsForFormation(sessionId, formationId, traineeIds) {
  // on ne ré-initialise que s'il n'existe encore aucune FinalDecision
  const existingCount = await FinalDecision.countDocuments({
    session: sessionId,
    formation: formationId,
  });
  if (existingCount > 0) {
    return;
  }

  const evals = await Evaluation.find({
    session: sessionId,
    formation: formationId,
    trainee: { $in: traineeIds },
    status: 'validated',
  }).lean();

  const evalsByTrainee = new Map(evals.map(ev => [String(ev.trainee), ev]));

  const affects = await SessionAffectation.find({
    formation: formationId,
    user: { $in: traineeIds },
    role: 'trainee',
  })
    .select('_id user')
    .lean();

  const affByUser = new Map(affects.map(a => [String(a.user), a._id]));

  for (const trId of traineeIds) {
    const key = String(trId);
    const ev = evalsByTrainee.get(key);
    const affId = affByUser.get(key);
    if (!ev || !affId) continue;

    const { totalNote, totalMax } = computeTotals(ev);

    await FinalDecision.findOneAndUpdate(
      {
        session: sessionId,
        formation: formationId,
        trainee: trId,
      },
      {
        $set: {
          affectation: affId,
          totalNote,
          totalMax,
          decision: null,
          status: 'draft',
          approvals: [],
          validatedBy: null,
          validatedAt: null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
  }
}

/* ============================================================
 * 1) GET /evaluations/formations/:formationId/trainees
 *    → Liste des stagiaires présents + évaluation + finalDecision (si existe)
 * ============================================================*/
router.get(
  '/formations/:formationId/trainees',
  requireAuth,
  [param('formationId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;

    const { formationId } = req.params;

    try {
      const formation = await Formation.findById(formationId)
        .select('_id session nom')
        .lean();

      if (!formation) {
        return res.status(404).json({ error: 'Formation introuvable' });
      }

      const sessionId = formation.session;

      const affectations = await SessionAffectation.find({
        formation: formationId,
        role: 'trainee',
        isPresent: true,
      })
        .select('_id user isPresent')
        .populate({
          path: 'user',
          select: '_id prenom nom email idScout region phone',
        })
        .lean();

      const traineeIds = affectations
        .map(a => (a.user ? a.user._id : null))
        .filter(Boolean);

      let evalsByTrainee = new Map();
      if (traineeIds.length) {
        const evals = await Evaluation.find({
          formation: formationId,
          trainee: { $in: traineeIds },
        })
          .select('trainee status approvals items validatedBy validatedAt')
          .lean();

        evalsByTrainee = new Map(evals.map(ev => [String(ev.trainee), ev]));
      }

      // 🔁 FinalDecision par stagiaire (si elles existent)
      let finalDecisionsByTrainee = new Map();
      if (traineeIds.length) {
        const finalDecisions = await FinalDecision.find({
          formation: formationId,
          trainee: { $in: traineeIds },
        })
          .select(
            'trainee decision status approvals validatedBy validatedAt totalNote totalMax'
          )
          .lean();

        finalDecisionsByTrainee = new Map(
          finalDecisions.map(fd => [String(fd.trainee), fd])
        );
      }

      const payload = affectations.map(a => {
        if (!a.user) {
          return {
            affectationId: String(a._id),
            isPresent: !!a.isPresent,
            trainee: null,
            evaluation: null,
            finalDecision: null,
          };
        }

        const tid = String(a.user._id);
        const ev = evalsByTrainee.get(tid) || null;
        const fd = finalDecisionsByTrainee.get(tid) || null;

        return {
          affectationId: String(a._id),
          isPresent: !!a.isPresent,
          trainee: {
            _id: tid,
            prenom: a.user.prenom,
            nom: a.user.nom,
            email: a.user.email,
            idScout: a.user.idScout,
            region: a.user.region || null,
            phone: a.user.phone || null,
          },
          evaluation: ev
            ? {
                _id: String(ev._id),
                status: ev.status,
                approvals: (ev.approvals || []).map(ap => ({
                  user: String(ap.user),
                  role: ap.role,
                  approvedAt: ap.approvedAt,
                })),
                validatedBy: ev.validatedBy ? String(ev.validatedBy) : null,
                validatedAt: ev.validatedAt || null,
                items: (ev.items || []).map(it => ({
                  critere: String(it.critere),
                  famille: it.famille,
                  note: it.note,
                  maxnote: it.maxnote,
                })),
              }
            : null,
          finalDecision: fd
            ? {
                _id: String(fd._id),
                decision: fd.decision || null,
                status: fd.status,
                approvals: (fd.approvals || []).map(ap => ({
                  user: String(ap.user),
                  role: ap.role,
                  approvedAt: ap.approvedAt,
                })),
                validatedBy: fd.validatedBy ? String(fd.validatedBy) : null,
                validatedAt: fd.validatedAt || null,
                totalNote: fd.totalNote,
                totalMax: fd.totalMax,
              }
            : null,
        };
      });

      return res.json({
        formationId: String(formation._id),
        sessionId: sessionId ? String(sessionId) : null,
        trainees: payload,
      });
    } catch (err) {
      console.error(
        'GET /evaluations/formations/:formationId/trainees ERROR',
        err
      );
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ============================================================
// 2) POST /evaluations/trainee
//    → Saisie / mise à jour des notes par le directeur
// ============================================================
router.post(
  '/trainee',
  requireAuth,
  [
    body('session').isMongoId(),
    body('formation').isMongoId(),
    body('traineeId').isMongoId(),
    body('items').isArray({ min: 1 }),
  ],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;

    const userId = req.user.id;
    const { session, formation, traineeId, items } = req.body || {};

    try {
      // 🔐 Seul le director peut saisir les notes
      const myAff = await SessionAffectation.findOne({
        formation,
        user: userId,
        role: 'director',
      })
        .select('_id')
        .lean();

      if (!myAff) {
        return res
          .status(403)
          .json({ error: 'Seul قائد الدورة peut saisir les notes.' });
      }

      // 🔍 Affectation du stagiaire
      const traineeAff = await SessionAffectation.findOne({
        formation,
        user: traineeId,
        role: 'trainee',
      })
        .select('_id')
        .lean();

      if (!traineeAff) {
        return res.status(400).json({
          error:
            'Affectation du stagiaire introuvable pour cette formation. Impossible de créer le bilan.',
        });
      }

      const normItems = (items || []).map(it => ({
        critere: it.critere,
        famille: it.famille || '',
        note: Number(it.note || 0),
        maxnote: it.maxnote != null ? Number(it.maxnote) : undefined,
      }));

      // 🔎 1) On enregistre l’évaluation + approval du director
      let evaluation = await Evaluation.findOneAndUpdate(
        { session, formation, trainee: traineeId },
        {
          $set: {
            items: normItems,
            status: 'pending_team',
            validatedBy: userId,
            validatedAt: new Date(),
            affectation: traineeAff._id,
          },
          $addToSet: {
            approvals: {
              user: userId,
              role: 'director',
            },
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      // 🔁 2) On récupère l’équipe (director + trainers)
      const teamAffects = await SessionAffectation.find({
        formation,
        role: { $in: ['director', 'trainer'] },
      })
        .select('user role')
        .lean();

      const teamUserIds = teamAffects.map(a => String(a.user));
      const approvedUserIds = (evaluation.approvals || [])
        .filter(a => ['director', 'trainer'].includes(a.role))
        .map(a => String(a.user));

      const allApproved =
        teamUserIds.length > 0 &&
        teamUserIds.every(uid => approvedUserIds.includes(uid));

      if (allApproved) {
        evaluation.status = 'validated';
        evaluation.validatedBy = userId;
        evaluation.validatedAt = new Date();
        await evaluation.save();

        // 🧮 3) Si TOUS les stagiaires présents sont validés,
        // on initialise les FinalDecision (même logique que dans /trainee/approve)
        try {
          const presentAffects = await SessionAffectation.find({
            formation,
            role: 'trainee',
            isPresent: true,
          })
            .select('user')
            .lean();

          const traineeIds = presentAffects
            .map(a => a.user)
            .filter(Boolean);

          if (traineeIds.length) {
            const validatedCount = await Evaluation.countDocuments({
              session,
              formation,
              trainee: { $in: traineeIds },
              status: 'validated',
            });

            if (validatedCount === traineeIds.length) {
              await initFinalDecisionsForFormation(session, formation, traineeIds);
            }
          }
        } catch (err2) {
          console.error(
            'Error while initializing FinalDecision after director save',
            err2
          );
        }
      }

      return res.json({
        ok: true,
        evaluation,
      });
    } catch (err) {
      console.error('POST /evaluations/trainee ERROR', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// -----------------------------------------------------------------------------
// 3) POST /api/evaluations/trainee/approve
//    Valide / approuve une évaluation existante
// -----------------------------------------------------------------------------
router.post(
  '/trainee/approve',
  requireAuth,
  [
    body('session').isMongoId(),
    body('formation').isMongoId(),
    body('traineeId').isMongoId(),
  ],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;

    try {
      const { session, formation, traineeId } = req.body;

      const meId = (req.user && (req.user.id || req.user._id)) || null;

      if (!meId) {
        return res.status(401).json({ message: 'Utilisateur non authentifié.' });
      }

      const myAffectation = await SessionAffectation.findOne({
        formation,
        user: meId,
        role: { $in: ['director', 'trainer'] },
      }).lean();

      if (!myAffectation) {
        return res.status(403).json({
          message:
            'Vous devez faire partie de l’équipe de direction (director ou trainer) de cette formation pour valider ce bilan.',
        });
      }

      const evaluation = await Evaluation.findOne({
        session,
        formation,
        trainee: traineeId,
      });

      if (!evaluation) {
        return res.status(404).json({
          message:
            'Aucune évaluation trouvée pour ce stagiaire dans cette formation / session.',
        });
      }

      if (!evaluation.affectation) {
        const traineeAff = await SessionAffectation.findOne({
          formation,
          user: traineeId,
          role: 'trainee',
        })
          .select('_id')
          .lean();

        if (!traineeAff) {
          return res.status(400).json({
            message:
              "Impossible de trouver l'affectation du stagiaire pour cette formation. Le bilan ne peut pas être validé.",
          });
        }

        evaluation.affectation = traineeAff._id;
      }

      const already = (evaluation.approvals || []).find(
        a => a.user.toString() === meId.toString()
      );

      if (!already) {
        evaluation.approvals.push({
          user: meId,
          role: myAffectation.role,
          approvedAt: new Date(),
        });
      }

      if (evaluation.status === 'draft') {
        evaluation.status = 'pending_team';
      }

      const teamAffects = await SessionAffectation.find({
        formation,
        role: { $in: ['director', 'trainer'] },
      })
        .select('user role')
        .lean();

      const teamUserIds = teamAffects.map(a => String(a.user));
      const approvedUserIds = (evaluation.approvals || [])
        .filter(a => ['director', 'trainer'].includes(a.role))
        .map(a => String(a.user));

      const allApproved = teamUserIds.every(uid =>
        approvedUserIds.includes(uid)
      );

      if (teamUserIds.length > 0 && allApproved) {
        evaluation.status = 'validated';
        evaluation.validatedBy = meId;
        evaluation.validatedAt = new Date();
      } else if (evaluation.status === 'draft') {
        evaluation.status = 'pending_team';
      }

      await evaluation.save();

      // 🔁 Si TOUS les stagiaires présents ont une évaluation validée,
      // on initialise les FinalDecision pour cette formation/session.
      try {
        const presentAffects = await SessionAffectation.find({
          formation,
          role: 'trainee',
          isPresent: true,
        })
          .select('user')
          .lean();

        const traineeIds = presentAffects
          .map(a => a.user)
          .filter(Boolean);

        if (traineeIds.length) {
          const validatedCount = await Evaluation.countDocuments({
            session,
            formation,
            trainee: { $in: traineeIds },
            status: 'validated',
          });

          if (validatedCount === traineeIds.length) {
            await initFinalDecisionsForFormation(session, formation, traineeIds);
          }
        }
      } catch (err2) {
        console.error(
          'Error while initializing FinalDecision after evaluation approval',
          err2
        );
      }

      return res.json({ evaluation });
    } catch (err) {
      console.error('POST /evaluations/trainee/approve ERROR', err);
      return res.status(500).json({
        message: 'Erreur serveur lors de la validation du bilan.',
      });
    }
  }
);

module.exports = router;
