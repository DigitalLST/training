// routes/finalDecisions.js
const express = require('express');
const { body, param, validationResult } = require('express-validator');

const requireAuth = require('../middlewares/auth');
const FinalDecision = require('../models/finalDecision');
const Evaluation = require('../models/evaluation');
const Formation = require('../models/formation');
const SessionAffectation = require('../models/affectation');
const FormationReport = require('../models/formationReport');
const Session = require('../models/session'); // ✅ AJOUT

const { generateFinalResultsPdf } = require('../services/pdf');

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
  const totalMax = ev.items.reduce((sum, it) => sum + (Number(it.maxnote) || 0), 0);
  const totalNote = ev.items.reduce((sum, it) => sum + (Number(it.note) || 0), 0);
  const pct = totalMax > 0 ? Math.round((totalNote / totalMax) * 1000) / 10 : 0;
  return { totalNote, totalMax, pct };
}

/**
 * ⚠️ Validateurs = director + trainer uniquement
 * On calcule l'équipe "coreTeam" (validateurs) pour décider du status
 */
async function getCoreTeamUserIds(formationId) {
  const teamAffects = await SessionAffectation.find({
    formation: formationId,
    role: { $in: ['director', 'trainer'] },
  })
    .select('user role')
    .lean();

  const ids = teamAffects
    .map(a => (a.user ? String(a.user) : null))
    .filter(Boolean);

  return ids;
}

/**
 * ✅ Applique la logique de validation "comme evaluation"
 * - si coreTeam = [director] uniquement => validated dès que director approuve
 * - sinon validated quand tous les users du coreTeam ont approuvé
 */
function computeStatusForApprovals(coreTeamUserIds, approvals) {
  const approvedUserIds = (approvals || [])
    .filter(a => ['director', 'trainer'].includes(a.role))
    .map(a => String(a.user));

  // aucun validateur -> on reste draft (cas anormal)
  if (!coreTeamUserIds.length) return { status: 'draft', allApproved: false };

  const allApproved = coreTeamUserIds.every(uid => approvedUserIds.includes(uid));

  if (allApproved) return { status: 'validated', allApproved: true };
  return { status: 'pending_team', allApproved: false };
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

  // ✅ 1.b) CN validations (president + commissioner) depuis Session.validations
  let cnPresident = null;
  let cnCommissioner = null;

  const sessionId = formation.session?._id || formation.session;
  if (sessionId) {
    const sessionDoc = await Session.findById(sessionId)
      .select('validations')
      .populate('validations.president.validatedBy', 'prenom nom signatureUrl')
      .populate('validations.commissioner.validatedBy', 'prenom nom signatureUrl')
      .lean();

    const pres = sessionDoc?.validations?.president || null;
    const comm = sessionDoc?.validations?.commissioner || null;

    if (pres?.isValidated && pres?.validatedBy) {
      cnPresident = {
        role: 'cn_president',
        roleLabel: 'رئيس اللجنة الوطنية',
        prenom: pres.validatedBy?.prenom || '',
        nom: pres.validatedBy?.nom || '',
        validatedAt: pres.validatedAt || null,
        signatureUrl: pres.validatedBy?.signatureUrl || null,
      };
    }

    if (comm?.isValidated && comm?.validatedBy) {
      cnCommissioner = {
        role: 'cn_commissioner',
        roleLabel: 'القائد العام',
        prenom: comm.validatedBy?.prenom || '',
        nom: comm.validatedBy?.nom || '',
        validatedAt: comm.validatedAt || null,
        signatureUrl: comm.validatedBy?.signatureUrl || null,
      };
    }
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

    // garder uniquement ceux qui ont une évaluation validée (== évalués)
    const evalForT = evalByTraineeId.get(traineeId);
    if (!evalForT) continue;

    const totals = computeTotals(evalForT);

    const affect = affectByUserId.get(traineeId) || {};
    const decision = fd.decision || null;

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
      evaluation: evalForT,
    });
  }

  // 6) Équipe de direction (report) = director + trainer + assistant + coach
  const teamAffects = await SessionAffectation.find({
    formation: formationId,
    role: { $in: ['director', 'trainer', 'assistant', 'coach'] },
  })
    .populate({ path: 'user', select: 'prenom nom signatureUrl' })
    .lean();

  // approvals par user (pour "hasApproved" dans report)
  const approvalsByUser = new Map(); // userId -> { hasApproved, lastApprovedAt }
  for (const fd of decisionsDocs) {
    for (const ap of (fd.approvals || [])) {
      const uid = ap.user ? String(ap.user._id || ap.user) : null;
      if (!uid) continue;

      const prev = approvalsByUser.get(uid) || {
        hasApproved: false,
        lastApprovedAt: null,
      };

      const d = ap.approvedAt ? new Date(ap.approvedAt) : null;
      if (d && (!prev.lastApprovedAt || d > prev.lastApprovedAt)) {
        prev.lastApprovedAt = d;
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
      lastApprovedAt: info.lastApprovedAt ? info.lastApprovedAt.toISOString() : null,
      signatureUrl: u.signatureUrl || null,
    };
  });

  // ✅ meta validation basée uniquement sur director+trainer
  const coreTeam = team.filter(m => m.role === 'director' || m.role === 'trainer');
  const anyTrainerApproved = coreTeam.some(m => m.role === 'trainer' && m.hasApproved);
  const allTeamApproved = coreTeam.length > 0 && coreTeam.every(m => m.hasApproved);

  // date de validation = max approvedAt parmi coreTeam
  let validationDate = null;
  for (const m of coreTeam) {
    if (!m.lastApprovedAt) continue;
    const d = new Date(m.lastApprovedAt);
    if (!validationDate || d > validationDate) validationDate = d;
  }

  // 7) % success global (par rapport aux présents)
  const successPct =
    totalPresent > 0 ? Math.round((successCount / totalPresent) * 1000) / 10 : 0;

  // 8) Director principal
  const director = team.find(m => m.role === 'director') || null;

  // 9) Rapports director / coach
  const directorReportDoc = await FormationReport.findOne({
    formation: formationId,
    role: 'director',
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .populate({ path: 'user', select: 'prenom nom' })
    .lean();

  const coachReportDoc = await FormationReport.findOne({
    formation: formationId,
    role: 'coach',
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .populate({ path: 'user', select: 'prenom nom' })
    .lean();

  let directorReport = null;
  if (directorReportDoc) {
    const u = directorReportDoc.user || {};
    directorReport = {
      prenom: u.prenom || '',
      nom: u.nom || '',
      block1: directorReportDoc.block1 || '',
      block2: directorReportDoc.block2 || '',
      block3: directorReportDoc.block3 || '',
      signedAt: directorReportDoc.signedAt || null,
      updatedAt: directorReportDoc.updatedAt || null,
    };
  }

  let coachReport = null;
  if (coachReportDoc) {
    const u = coachReportDoc.user || {};
    coachReport = {
      prenom: u.prenom || '',
      nom: u.nom || '',
      block1: coachReportDoc.block1 || '',
      block2: coachReportDoc.block2 || '',
      block3: coachReportDoc.block3 || '',
      signedAt: coachReportDoc.signedAt || null,
      updatedAt: coachReportDoc.updatedAt || null,
    };
  }

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
    trainees: traineesRows,
    stats: {
      totalParticipants,
      totalPresent,
      successCount,
      retakeCount,
      incompatibleCount,
      successPct,
      validationDate: validationDate ? validationDate.toISOString() : null,
    },
    team, // équipe complète (même non validateurs)
    directorReport,
    coachReport,
    decisionsRaw: decisionsDocs,
    meta: {
      anyTrainerApproved,
      allTeamApproved, // basé sur coreTeam (director+trainer)
    },

    // ✅ AJOUT: CN validations
    cnPresident,
    cnCommissioner,
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
      console.error('GET /final-decisions/formations/:formationId/report-data ERROR', err);
      const status = err.statusCode || 500;
      return res.status(status).json({
        message: err.message || 'Erreur lors de la préparation du report.',
      });
    }
  }
);

/* ----------------- POST /formations/:formationId ----------------- */
/**
 * POST /api/final-decisions/formations/:formationId
 * Body: { decisions: [{ traineeId, decision }] }
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
      const formation = await Formation.findById(formationId).select('_id session').lean();
      if (!formation) return res.status(404).json({ message: 'Formation introuvable' });

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

      // ✅ coreTeam validateurs
      const coreTeamUserIds = await getCoreTeamUserIds(formationId);

      const resultDocs = [];

      for (const d of decisions) {
        if (!d.traineeId || !allowed.includes(d.decision)) continue;

        const evaluation = await Evaluation.findOne({
          session: sessionId,
          formation: formationId,
          trainee: d.traineeId,
          status: 'validated',
        }).lean();
        if (!evaluation) continue;

        const traineeAff = await SessionAffectation.findOne({
          formation: formationId,
          user: d.traineeId,
          role: 'trainee',
        })
          .select('_id')
          .lean();
        if (!traineeAff) continue;

        const { totalNote, totalMax } = computeTotals(evaluation);
        const now = new Date();

        const updateSet = {
          affectation: traineeAff._id,
          totalNote,
          totalMax,
          decision: d.decision,
          validatedBy: null,
          validatedAt: null,
          status: 'draft',
          approvals: [],
        };

        // ✅ si director saisit : on démarre le workflow
        if (isDirector && meId) {
          const approvals = [
            {
              user: meId,
              role: 'director',
              approvedAt: now,
            },
          ];

          // ✅ règle : si coreTeam = director only => validated direct
          const { status } = computeStatusForApprovals(coreTeamUserIds, approvals);

          updateSet.status = status;
          updateSet.approvals = approvals;

          if (status === 'validated') {
            updateSet.validatedBy = meId;
            updateSet.validatedAt = now;
          }
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
        return res.status(400).json({ message: 'Aucune décision finale valide à enregistrer.' });
      }

      return res.json({
        success: true,
        count: resultDocs.length,
        finalDecisions: resultDocs,
      });
    } catch (err) {
      console.error('POST /final-decisions/formations/:formationId ERROR', err);
      return res.status(500).json({ message: 'Erreur serveur' });
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

      if (!meId) return res.status(401).json({ message: 'Utilisateur non authentifié.' });

      const f = await Formation.findById(formation).select('_id session').lean();
      if (!f) return res.status(404).json({ message: 'Formation introuvable' });

      const sessionId = f.session;

      // je dois être director/trainer
      const myAffectation = await SessionAffectation.findOne({
        formation,
        user: meId,
        role: { $in: ['director', 'trainer'] },
      }).lean();

      if (!myAffectation) {
        return res.status(403).json({
          message: "Vous devez faire partie de l’équipe de direction pour valider la décision finale.",
        });
      }

      let finalDecision = await FinalDecision.findOne({
        session: sessionId,
        formation,
        trainee: traineeId,
      });

      if (!finalDecision) {
        return res.status(404).json({ message: 'Décision finale introuvable pour ce stagiaire.' });
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
            message: "Impossible de trouver l'affectation du stagiaire pour cette formation.",
          });
        }

        finalDecision.affectation = traineeAff._id;
      }

      // add approval si pas déjà
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

      // ✅ coreTeam validateurs
      const coreTeamUserIds = await getCoreTeamUserIds(formation);

      // ✅ compute status
      const { status, allApproved } = computeStatusForApprovals(
        coreTeamUserIds,
        finalDecision.approvals
      );

      finalDecision.status = status;

      if (allApproved) {
        finalDecision.validatedBy = meId;
        finalDecision.validatedAt = new Date();
      } else {
        finalDecision.validatedBy = null;
        finalDecision.validatedAt = null;
      }

      await finalDecision.save();

      return res.json({ finalDecision });
    } catch (err) {
      console.error('POST /final-decisions/approve ERROR', err);
      return res.status(500).json({
        message: 'Erreur serveur lors de la validation de la décision finale.',
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
        if (docs.every(fd => fd.status === 'validated')) formationStatus = 'validated';
        else if (docs.some(fd => fd.status === 'pending_team' || fd.status === 'validated'))
          formationStatus = 'pending_team';
        else formationStatus = 'draft';
      }

      // équipe validateurs only (director/trainer)
      const teamAffects = await SessionAffectation.find({
        formation: formationId,
        role: { $in: ['director', 'trainer'] },
      })
        .select('user role')
        .populate({ path: 'user', select: '_id prenom nom' })
        .lean();

      const approvalsByUser = new Map(); // userId -> { hasApproved, lastApprovedAt }
      for (const fd of docs) {
        for (const ap of (fd.approvals || [])) {
          const uid = String(ap.user);
          const prev = approvalsByUser.get(uid) || { hasApproved: false, lastApprovedAt: null };

          const currentDate = ap.approvedAt ? new Date(ap.approvedAt) : null;
          if (currentDate && (!prev.lastApprovedAt || currentDate > prev.lastApprovedAt)) {
            prev.lastApprovedAt = currentDate;
          }

          prev.hasApproved = true;
          approvalsByUser.set(uid, prev);
        }
      }

      const team = teamAffects.map(a => {
        const u = a.user || {};
        const uid = u._id ? String(u._id) : String(a.user);
        const info = approvalsByUser.get(uid) || { hasApproved: false, lastApprovedAt: null };
        return {
          userId: uid,
          prenom: u.prenom || '',
          nom: u.nom || '',
          role: a.role,
          hasApproved: !!info.hasApproved,
          lastApprovedAt: info.lastApprovedAt ? info.lastApprovedAt.toISOString() : null,
        };
      });

      const allTeamApproved = team.length > 0 && team.every(m => m.hasApproved);
      const anyTrainerApproved = team.some(m => m.role === 'trainer' && m.hasApproved);

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
      console.error('GET /final-decisions/formations/:formationId ERROR', err);
      return res.status(500).json({
        message: 'Erreur serveur lors de la lecture des décisions.',
      });
    }
  }
);

/* ----------------- GET /formations/:formationId/report (PDF) ----------------- */

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
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

      return res.end(pdfBuffer);
    } catch (err) {
      console.error('GET /final-decisions/formations/:formationId/report ERROR', err);
      return res.status(500).json({ message: 'Erreur serveur lors de la génération du PDF.' });
    }
  }
);

module.exports = router;
