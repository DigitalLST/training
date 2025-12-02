// routes/finalDecisions.js (ou final-decisions.js)
const express = require('express');
const { body, param, validationResult } = require('express-validator');

const requireAuth = require('../middlewares/auth');
const FinalDecision = require('../models/finalDecision');
const Evaluation = require('../models/evaluation');
const Formation = require('../models/formation');
const SessionAffectation = require('../models/affectation');
const User = require('../models/user'); 
const { generateFinalResultsPdf } = require('../services/pdf');// si tu en as besoin ailleurs


const router = express.Router();

/* ----------------- helpers génériques ----------------- */

function bad(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(400).json({ errors: e.array() });
  return null;
}

// petite fonction util pour calculer les totaux depuis Evaluation.items
function computeTotals(ev) {
  if (!ev || !Array.isArray(ev.items)) {
    return { totalNote: 0, totalMax: 0, pct: 0 };
  }
  const totalMax = ev.items.reduce(
    (sum, it) => sum + (Number(it.maxnote) || 0),
    0
  );
  const totalNote = ev.items.reduce(
    (sum, it) => sum + (Number(it.note) || 0),
    0
  );
  const pct =
    totalMax > 0 ? Math.round((totalNote / totalMax) * 1000) / 10 : 0;
  return { totalNote, totalMax, pct };
}

/* ----------- préparation des données du report ----------- */

async function buildFinalResultsReportData(formationId) {
  // 1) Formation + session + centre
  const formation = await Formation.findById(formationId)
    .populate({ path: 'centre', select: 'title region' })
    .populate({ path: 'session', select: 'title startDate endDate' })
    .lean();

  if (!formation) {
    const err = new Error('Formation introuvable');
    err.statusCode = 404;
    throw err;
  }

  // 2) Affectations trainees (pour participants / présents)
  const traineeAffects = await SessionAffectation.find({
    formation: formationId,
    role: 'trainee',
  })
    .populate({
      path: 'user',
      select: 'prenom nom email idScout region signatureUrl',
    })
    .lean();

  const totalParticipants = traineeAffects.length;
  const totalPresent = traineeAffects.filter(a => a.isPresent).length;

  // Map userId -> affectation (présence + meta)
  const affectByUserId = new Map();
  for (const a of traineeAffects) {
    const u = a.user || {};
    const uid = u._id ? String(u._id) : String(a.user);
    affectByUserId.set(uid, {
      isPresent: !!a.isPresent,
      prenom: u.prenom || '',
      nom: u.nom || '',
      email: u.email || '',
      idScout: u.idScout || '',
      region: u.region || '',
    });
  }

  // 3) Décisions finales
  const decisionsDocs = await FinalDecision.find({
    formation: formationId,
  })
    .populate({ path: 'trainee', select: 'prenom nom email idScout region' })
    .populate({ path: 'approvals.user', select: 'prenom nom' })
    .lean();

 // 4) Évaluations validées (pour calculer note & %)
// + populate items.critere vers Critere
const evalDocs = await Evaluation.find({
  formation: formationId,
  status: 'validated',
})
  .populate({ path: 'trainee', select: '_id' })
  .populate({
    path: 'items.critere',
    select: 'famille critere',
  })
  .lean();

const evalByTraineeId = new Map();
for (const ev of evalDocs) {
  const t = ev.trainee;
  if (!t) continue;
  const uid = t._id ? String(t._id) : String(t);

  // Injection labels depuis Critere
  ev.items = (ev.items || []).map(it => ({
    ...it,
    familleLabel: it.critere?.famille || '',
    critereLabel: it.critere?.critere || '',
  }));

  evalByTraineeId.set(uid, ev);
}


  // 5) Construction de la liste "trainees" pour le tableau global
  let successCount = 0;
  let retakeCount = 0;
  let incompatibleCount = 0;

  const traineesRows = [];

  for (const fd of decisionsDocs) {
    const t = fd.trainee;
    if (!t) continue;
    const traineeId = t._id ? String(t._id) : String(t);

    // garder uniquement ceux qui ont une évaluation (== évalués)
    const evalForT = evalByTraineeId.get(traineeId);
    if (!evalForT) continue;

    const totals = computeTotals(evalForT);

    const affect = affectByUserId.get(traineeId) || {};
    const decision = fd.decision || null; // 'success' | 'retake' | 'incompatible' | null

    if (decision === 'success') successCount++;
    if (decision === 'retake') retakeCount++;
    if (decision === 'incompatible') incompatibleCount++;

    traineesRows.push({
      traineeId,
      idScout: affect.idScout || t.idScout || '',
      prenom: affect.prenom || t.prenom || '',
      nom: affect.nom || t.nom || '',
      region: affect.region || t.region || '',
      email: affect.email || t.email || '',
      totalNote: totals.totalNote,
      totalMax: totals.totalMax,
      pct: totals.pct,
      decision,
      evaluation: evalForT, // utile pour la page individuelle (critères)
    });
  }

  // 6) Équipe de direction (director + trainer) depuis SessionAffectation
  const teamAffects = await SessionAffectation.find({
    formation: formationId,
    role: { $in: ['director', 'trainer'] },
  })
    .populate({ path: 'user', select: 'prenom nom signatureUrl' })
    .lean();

  // approvals par user
  const approvalsByUser = new Map(); // userId -> { hasApproved, lastApprovedAt, signatureUrl }

  for (const fd of decisionsDocs) {
    for (const ap of fd.approvals || []) {
      const uid = ap.user ? String(ap.user._id || ap.user) : null;
      if (!uid) continue;

      const prev = approvalsByUser.get(uid) || {
        hasApproved: false,
        lastApprovedAt: null,
        signatureUrl: null,
      };

      const currentDate = ap.approvedAt ? new Date(ap.approvedAt) : null;
      if (currentDate) {
        if (!prev.lastApprovedAt || currentDate > prev.lastApprovedAt) {
          prev.lastApprovedAt = currentDate;
        }
      }

      if (ap.signatureUrl) {
        prev.signatureUrl = ap.signatureUrl;
      }

      prev.hasApproved = true;
      approvalsByUser.set(uid, prev);
    }
  }

  const team = [];
  let validationDate = null;

  for (const a of teamAffects) {
    const u = a.user || {};
    const uid = u._id ? String(u._id) : String(a.user);

    const info = approvalsByUser.get(uid) || {
      hasApproved: false,
      lastApprovedAt: null,
      signatureUrl: null,
    };

    if (info.lastApprovedAt) {
      if (!validationDate || info.lastApprovedAt > validationDate) {
        validationDate = info.lastApprovedAt;
      }
    }

    team.push({
      userId: uid,
      prenom: u.prenom || '',
      nom: u.nom || '',
      role: a.role, // 'director' | 'trainer'
      hasApproved: info.hasApproved,
      lastApprovedAt: info.lastApprovedAt
        ? info.lastApprovedAt.toISOString()
        : null,
      signatureUrl: u.signatureUrl || null,
    });
  }

  const anyTrainerApproved = team.some(
    m => m.role === 'trainer' && m.hasApproved
  );
  const allTeamApproved =
    team.length > 0 && team.every(m => m.hasApproved);

  // 7) % success global (par rapport aux présents)
  const successPct =
    totalPresent > 0 ? Math.round((successCount / totalPresent) * 1000) / 10 : 0;

  // 8) Director principal (on prend le premier role=director)
  const director = team.find(m => m.role === 'director') || null;

  return {
    formation: {
      id: String(formation._id),
      nom: formation.nom || '',
      niveau: formation.niveau || '',
      centreTitle: formation.centre?.title || '',
      centreRegion: formation.centre?.region || '',
    },
    session: formation.session
      ? {
          title: formation.session.title || '',
          startDate: formation.session.startDate || null,
          endDate: formation.session.endDate || null,
        }
      : null,
    director,
    trainees: traineesRows, // seulement ceux qui ont une évaluation
    stats: {
      totalParticipants,
      totalPresent,
      successCount,
      retakeCount,
      incompatibleCount,
      successPct,
      validationDate: validationDate ? validationDate.toISOString() : null,
    },
    team, // pour signatures & rôles
    decisionsRaw: decisionsDocs, // si besoin debug
    meta: {
      anyTrainerApproved,
      allTeamApproved,
    },
  };
}

/* ----------------- GET /report-data ----------------- */

router.get(
  '/formations/:formationId/report-data',
  requireAuth,
  [param('formationId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;

    const { formationId } = req.params;

    try {
      const data = await buildFinalResultsReportData(formationId);
      return res.json(data);
    } catch (err) {
      console.error(
        'GET /final-decisions/formations/:formationId/report-data ERROR',
        err
      );
      const status = err.statusCode || 500;
      return res
        .status(status)
        .json({
          message:
            err.message || 'Erreur lors de la préparation du report.',
        });
    }
  }
);

/* ----------------- POST /formations/:formationId ----------------- */
/**
 * POST /api/final-decisions/formations/:formationId
 * Body: { decisions: [{ traineeId, decision }] }
 * decision ∈ ['success','retake','incompatible']
 */
router.post(
  '/formations/:formationId',
  requireAuth,
  [param('formationId').isMongoId(), body('decisions').isArray({ min: 1 })],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;

    const { formationId } = req.params;
    const { decisions } = req.body;

    const allowed = ['success', 'retake', 'incompatible'];

    try {
      const formation = await Formation.findById(formationId)
        .select('_id session')
        .lean();

      if (!formation) {
        return res
          .status(404)
          .json({ message: 'Formation introuvable' });
      }

      const sessionId = formation.session;
      const meId = (req.user && (req.user.id || req.user._id)) || null;

      // est-ce que l'utilisateur est director sur cette formation ?
      let isDirector = false;
      if (meId) {
        const myAff = await SessionAffectation.findOne({
          formation: formationId,
          user: meId,
          role: 'director',
        }).lean();
        isDirector = !!myAff;
      }

      const resultDocs = [];

      for (const d of decisions) {
        if (!d.traineeId || !allowed.includes(d.decision)) {
          continue;
        }

        // 1) évaluation (validated)
        const evaluation = await Evaluation.findOne({
          session: sessionId,
          formation: formationId,
          trainee: d.traineeId,
          status: 'validated',
        }).lean();

        if (!evaluation) {
          continue;
        }

        // 2) affectation du stagiaire
        const traineeAff = await SessionAffectation.findOne({
          formation: formationId,
          user: d.traineeId,
          role: 'trainee',
        })
          .select('_id')
          .lean();

        if (!traineeAff) {
          continue;
        }

        // 3) totaux
        const { totalNote, totalMax } = computeTotals(evaluation);

        // 4) upsert FinalDecision
        const now = new Date();

        const updateSet = {
          affectation: traineeAff._id,
          totalNote,
          totalMax,
          decision: d.decision,
          validatedBy: null,
          validatedAt: null,
        };

        if (isDirector && meId) {
          updateSet.status = 'pending_team';
          updateSet.approvals = [
            {
              user: meId,
              role: 'director',
              approvedAt: now,
            },
          ];
        } else {
          updateSet.status = 'draft';
          updateSet.approvals = [];
        }

        const fd = await FinalDecision.findOneAndUpdate(
          {
            session: sessionId,
            formation: formationId,
            trainee: d.traineeId,
          },
          { $set: updateSet },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();

        resultDocs.push(fd);
      }

      if (!resultDocs.length) {
        return res.status(400).json({
          message:
            'Aucune décision finale valide à enregistrer.',
        });
      }

      return res.json({
        success: true,
        count: resultDocs.length,
        finalDecisions: resultDocs,
      });
    } catch (err) {
      console.error(
        'POST /final-decisions/formations/:formationId ERROR',
        err
      );
      return res
        .status(500)
        .json({ message: 'Erreur serveur' });
    }
  }
);

/* ----------------- POST /approve ----------------- */
/**
 * POST /api/final-decisions/approve
 * Body: { formation, traineeId }
 */
router.post(
  '/approve',
  requireAuth,
  [body('formation').isMongoId(), body('traineeId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;

    try {
      const { formation, traineeId } = req.body;
      const meId = (req.user && (req.user.id || req.user._id)) || null;

      if (!meId) {
        return res
          .status(401)
          .json({ message: 'Utilisateur non authentifié.' });
      }

      // formation -> session
      const f = await Formation.findById(formation)
        .select('_id session')
        .lean();

      if (!f) {
        return res
          .status(404)
          .json({ message: 'Formation introuvable' });
      }

      const sessionId = f.session;

      // je dois être director/trainer
      const myAffectation = await SessionAffectation.findOne({
        formation,
        user: meId,
        role: { $in: ['director', 'trainer'] },
      }).lean();

      if (!myAffectation) {
        return res.status(403).json({
          message:
            "Vous devez faire partie de l’équipe de direction pour valider la décision finale.",
        });
      }

      let finalDecision = await FinalDecision.findOne({
        session: sessionId,
        formation,
        trainee: traineeId,
      });

      if (!finalDecision) {
        return res.status(404).json({
          message:
            'Décision finale introuvable pour ce stagiaire.',
        });
      }

      // s'assurer qu'il y a une affectation
      if (!finalDecision.affectation) {
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
              "Impossible de trouver l'affectation du stagiaire pour cette formation.",
          });
        }

        finalDecision.affectation = traineeAff._id;
      }

      const already = (finalDecision.approvals || []).find(
        a => a.user.toString() === meId.toString()
      );

      if (!already) {
        finalDecision.approvals.push({
          user: meId,
          role: myAffectation.role,
          approvedAt: new Date(),
        });
      }

      if (finalDecision.status === 'draft') {
        finalDecision.status = 'pending_team';
      }

      // équipe de direction
      const teamAffects = await SessionAffectation.find({
        formation,
        role: { $in: ['director', 'trainer'] },
      })
        .select('user role')
        .lean();

      const teamUserIds = teamAffects.map(a => String(a.user));
      const approvedUserIds = (finalDecision.approvals || [])
        .filter(a =>
          ['director', 'trainer'].includes(a.role)
        )
        .map(a => String(a.user));

      const allApproved = teamUserIds.every(uid =>
        approvedUserIds.includes(uid)
      );

      if (teamUserIds.length > 0 && allApproved) {
        finalDecision.status = 'validated';
        finalDecision.validatedBy = meId;
        finalDecision.validatedAt = new Date();
      } else if (finalDecision.status === 'draft') {
        finalDecision.status = 'pending_team';
      }

      await finalDecision.save();

      return res.json({ finalDecision });
    } catch (err) {
      console.error(
        'POST /final-decisions/approve ERROR',
        err
      );
      return res.status(500).json({
        message:
          'Erreur serveur lors de la validation de la décision finale.',
      });
    }
  }
);

/* ----------------- GET /formations/:formationId ----------------- */
/**
 * Renvoie :
 * - decisions par stagiaire
 * - team director/trainer avec hasApproved + lastApprovedAt
 * - formationStatus (draft / pending_team / validated)
 */
router.get(
  '/formations/:formationId',
  requireAuth,
  [param('formationId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;

    const { formationId } = req.params;
    const meId = (req.user && (req.user.id || req.user._id)) || null;

    try {
      const docs = await FinalDecision.find({ formation: formationId })
        .select('trainee decision status approvals')
        .lean();

      const decisions = docs.map(fd => ({
        traineeId: String(fd.trainee),
        decision: fd.decision || null,
        status: fd.status,
        approvals: (fd.approvals || []).map(ap => ({
          userId: String(ap.user),
          role: ap.role,
          approvedAt: ap.approvedAt || null,
        })),
      }));

      // statut global de la formation
      let formationStatus = 'draft';

      if (docs.length > 0) {
        if (docs.every(fd => fd.status === 'validated')) {
          formationStatus = 'validated';
        } else if (
          docs.some(
            fd =>
              fd.status === 'pending_team' ||
              fd.status === 'validated'
          )
        ) {
          formationStatus = 'pending_team';
        } else {
          formationStatus = 'draft';
        }
      }

      // équipe
      const teamAffects = await SessionAffectation.find({
        formation: formationId,
        role: { $in: ['director', 'trainer'] },
      })
        .select('user role')
        .populate({
          path: 'user',
          select: '_id prenom nom',
        })
        .lean();

      const approvalsByUser = new Map(); // userId -> { hasApproved, lastApprovedAt }

      for (const fd of docs) {
        for (const ap of fd.approvals || []) {
          const uid = String(ap.user);
          const prev = approvalsByUser.get(uid) || {
            hasApproved: false,
            lastApprovedAt: null,
          };

          const currentDate = ap.approvedAt
            ? new Date(ap.approvedAt)
            : null;

          if (currentDate) {
            if (
              !prev.lastApprovedAt ||
              currentDate > prev.lastApprovedAt
            ) {
              prev.lastApprovedAt = currentDate;
            }
          }

          prev.hasApproved = true;
          approvalsByUser.set(uid, prev);
        }
      }

      const team = teamAffects.map(a => {
        const u = a.user || {};
        const uid = u._id ? String(u._id) : String(a.user);
        const info = approvalsByUser.get(uid) || {
          hasApproved: false,
          lastApprovedAt: null,
        };

        return {
          userId: uid,
          prenom: u.prenom || '',
          nom: u.nom || '',
          role: a.role,
          hasApproved: !!info.hasApproved,
          lastApprovedAt: info.lastApprovedAt
            ? info.lastApprovedAt.toISOString()
            : null,
        };
      });

      const allTeamApproved =
        team.length > 0 && team.every(m => m.hasApproved);
      const anyTrainerApproved = team.some(
        m => m.role === 'trainer' && m.hasApproved
      );

      let currentUserHasApproved = false;
      if (meId) {
        const meInfo = approvalsByUser.get(String(meId));
        currentUserHasApproved = !!(meInfo && meInfo.hasApproved);
      }

      return res.json({
        decisions,
        team,
        anyTrainerApproved,
        allTeamApproved,
        currentUserHasApproved,
        formationStatus,
      });
    } catch (err) {
      console.error(
        'GET /final-decisions/formations/:formationId ERROR',
        err
      );
      return res.status(500).json({
        message:
          'Erreur serveur lors de la lecture des décisions.',
      });
    }
  }
);

/* ----------------- GET /formations/:formationId/report (PDF) ----------------- */
/**
 * Génère le PDF "بطاقة النتائج" avec pdfmake via services/pdf.js
 */


// ...

router.get(
  '/formations/:formationId/report',
  requireAuth,
  [param('formationId').isMongoId()],
  async (req, res) => {
    const e = validationResult(req);
    if (!e.isEmpty()) return res.status(400).json({ errors: e.array() });

    try {
      const { formationId } = req.params;
      const data = await buildFinalResultsReportData(formationId);

      const filename = `resultats_${data.session?.title || 'session'}_${data.formation?.nom || 'formation'}.pdf`;

      const pdfBuffer = await generateFinalResultsPdf(data);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      );

      return res.end(pdfBuffer);
    } catch (err) {
      console.error(
        'GET /final-decisions/formations/:formationId/report ERROR',
        err
      );
      return res.status(500).json({
        message: 'Erreur serveur lors de la génération du PDF.',
      });
    }
  }
);




module.exports = router;
