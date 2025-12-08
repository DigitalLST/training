const express = require('express');
const { param, query, validationResult } = require('express-validator');
const requireAuth = require('../middlewares/auth');

const FormationAffectation = require('../models/affectation');
const User       = require('../models/user');
const Demande    = require('../models/demande');
const Formation  = require('../models/formation');
const Evaluation=require('../models/evaluation')
const router = express.Router();

function bad(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(400).json({ errors: e.array() });
  return null;
}
function rxFromQ(q) {
  if (!q) return null;
  const safe = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(safe, 'i');
}
const norm = v => (v ?? '').toString().trim();

/* -------------------------------------------------------------
   GET /affectations/formations/:formationId/affectations
------------------------------------------------------------- */
router.get(
  '/formations/:formationId/affectations',
  requireAuth,
  [param('formationId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;

    const { formationId } = req.params;

    try {
      const formation = await Formation.findById(formationId)
        .select('_id nom session')
        .lean();

      if (!formation) {
        return res.status(404).json({ error: 'Formation introuvable' });
      }

      const sessionId = formation.session;

      const rows = await FormationAffectation.find({ formation: formationId })
        .select('_id user role isPresent')
        .populate({
          path: 'user',
          select: '_id prenom nom email idScout region niveau',
        })
        .lean();

      const traineeUserIds = rows
        .filter(r => r.role === 'trainee' && r.user)
        .map(r => r.user._id);

      if (traineeUserIds.length === 0) {
        return res.json(rows.map(r => ({
          _id: String(r._id),
          role: r.role,
          isPresent: !!r.isPresent,
          user: r.user ? {
            _id: String(r.user._id),
            prenom: r.user.prenom,
            nom: r.user.nom,
            email: r.user.email,
            idScout: r.user.idScout,
            region: r.user.region || null,
            certifsSnapshot: [],
          } : null,
        })));
      }

      let demandes = [];
      if (sessionId) {
        demandes = await Demande.find({
          applicant: { $in: traineeUserIds },
          session: sessionId,
        })
          .select('applicant certifsSnapshot')
          .lean();
      }

      const snapshotByUser = new Map();
      for (const d of demandes) {
        const uid = String(d.applicant);
        const snaps = Array.isArray(d.certifsSnapshot)
          ? d.certifsSnapshot.map(c => ({
              code: c.code,
              date: c.date || c.doneAt || c.completedAt || null,
              label: c.label,
            }))
          : [];
        snapshotByUser.set(uid, snaps);
      }

      const payload = rows.map(r => {
        if (!r.user) return {
          _id: String(r._id),
          role: r.role,
          isPresent: !!r.isPresent,
          user: null,
        };

        const uid = String(r.user._id);
        return {
          _id: String(r._id),
          role: r.role,
          isPresent: !!r.isPresent,
          user: {
            _id: uid,
            prenom: r.user.prenom,
            nom: r.user.nom,
            email: r.user.email,
            idScout: r.user.idScout,
            region: r.user.region || null,
            certifsSnapshot: r.role === 'trainee'
              ? (snapshotByUser.get(uid) || [])
              : [],
          },
        };
      });

      return res.json(payload);
    } catch (err) {
      console.error('GET /affectations/formations/:formationId/affectations ERROR', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

/* -------------------------------------------------------------
   GET /affectations/formations/:formationId/candidates
------------------------------------------------------------- */
router.get(
  '/formations/:formationId/candidates',
  requireAuth,
  [
    param('formationId').isMongoId(),
    query('role').isIn(['trainer','assistant','director','coach','trainee']),
    query('q').optional().isString(),
  ],
  async (req, res) => {
    const e = bad(req, res); if (e) return;

    const { formationId } = req.params;
    const { role, q } = req.query;
    const re = rxFromQ(q);

    const f = await Formation.findById(formationId)
      .select('session niveau branches')
      .lean();
    if (!f) return res.status(404).json({ error: 'Formation introuvable' });

    const sessionId    = f.session;
    const formLevel    = norm(f.niveau);
    const formBranches = (Array.isArray(f.branches) ? f.branches : []).map(norm);

    const already = await FormationAffectation.find({ formation: formationId })
      .select('user role')
      .lean();
    const alreadyIds = new Set(already.map(a => String(a.user)));

    /* ------------------ DIRECTOR / COACH ------------------ */
    if (role === 'director' || role === 'coach') {
      const match = {
        $expr: {
          $in: [{ $trim: { input: { $ifNull: ['$niveau',''] } } },
          ['قائد تدريب','مساعد قائد تدريب']]
        }
      };
      if (re) match.$or = [
        { email: re },
        { idScout: re },
        { nom: re },
        { prenom: re },
      ];

      const users = await User.find(match).select('_id prenom nom email idScout').limit(50).lean();

      // ❗ Pas d'exclusion ici (tu l'as demandé)
      return res.json(users.map(u => ({
        _id: String(u._id),
        prenom: u.prenom,
        nom: u.nom,
        email: u.email,
        idScout: u.idScout,
      })));
    }

    /* ------------------ TRAINER / ASSISTANT ------------------ */
    if (role === 'trainer' || role === 'assistant') {
      const match = {};
      if (re) match.$or = [
        { email: re },
        { idScout: re },
        { nom: re },
        { prenom: re },
      ];

      const users = await User.find(match).select('_id prenom nom email idScout').limit(50).lean();

      // ❗ Pas d'exclusion ici non plus
      return res.json(users.map(u => ({
        _id: String(u._id),
        prenom: u.prenom,
        nom: u.nom,
        email: u.email,
        idScout: u.idScout,
      })));
    }

    /* ------------------ TRAINEE (excludeIds appliqué) ------------------ */
    if (role === 'trainee') {
      const demandes = await Demande.find({
        session: sessionId,
        statusNational: 'APPROVED',
      })
        .select('_id applicant trainingLevel branche')
        .populate({ path: 'applicant', select: '_id prenom nom email idScout' })
        .limit(300)
        .lean();

      const filtered = demandes.filter(d => {
        const u = d.applicant;
        if (!u) return false;

        if (alreadyIds.has(String(u._id))) return false; // exclusion

        if (norm(d.trainingLevel) !== formLevel) return false;
        if (formBranches.length && !formBranches.includes(norm(d.branche)))
          return false;

        if (re) {
          return (
            re.test(u.email || '') ||
            re.test(u.idScout || '') ||
            re.test(u.nom || '') ||
            re.test(u.prenom || '')
          );
        }

        return true;
      });

      return res.json(filtered.map(d => ({
        _id: String(d.applicant._id),
        prenom: d.applicant.prenom,
        nom: d.applicant.nom,
        email: d.applicant.email,
        idScout: d.applicant.idScout,
      })));
    }
  }
);

/* -------------------------------------------------------------
   POST /affectations/formations/:formationId/affectations/diff
------------------------------------------------------------- */
router.post(
  '/formations/:formationId/affectations/diff',
  requireAuth,
  [param('formationId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res); if (e) return;

    const { formationId } = req.params;
    const { upserts = [], deletes = [] } = req.body || {};

    const f = await Formation.findById(formationId)
      .select('session niveau branches')
      .lean();
    if (!f) return res.status(404).json({ error: 'Formation introuvable' });

    const sessionId    = f.session;
    const formLevel    = norm(f.niveau);
    const formBranches = (Array.isArray(f.branches) ? f.branches : []).map(norm);

    if (deletes.length) {
      await FormationAffectation.deleteMany({
        formation: formationId,
        user: { $in: deletes },
      });
    }

    for (const it of upserts) {
      const userId = it?.userId;
      const role   = it?.role;

      if (!userId || !role) {
        return res.status(400).json({ error: 'userId et rôle requis' });
      }

      /** CONTRÔLE NIVEAU POUR director + coach **/
      if (role === 'director' || role === 'coach') {
        const u = await User.findById(userId).select('_id niveau').lean();
        if (!u) return res.status(404).json({ error: 'User introuvable' });

        const nv = norm(u.niveau);
        if (!['قائد تدريب','مساعد قائد تدريب'].includes(nv)) {
          return res.status(400).json({
            error: `Niveau insuffisant pour rôle ${role}`,
          });
        }
        // Pas de break → on laisse passer pour l'upsert
      }

      /** CONTRÔLE POUR trainee **/
      if (role === 'trainee') {
        const d = await Demande.findOne({
          session: sessionId,
          applicant: userId,
          statusNational: 'APPROVED',
        })
          .select('trainingLevel branche')
          .lean();

        if (!d) {
          return res.status(400).json({
            error: 'Demande APPROVED introuvable pour cet utilisateur',
          });
        }
        if (norm(d.trainingLevel) !== formLevel) {
          return res.status(400).json({
            error: 'Niveau de demande incompatible avec la formation',
          });
        }
        if (formBranches.length && !formBranches.includes(norm(d.branche))) {
          return res.status(400).json({
            error: 'Branche de demande incompatible',
          });
        }
      }
    }

    if (upserts.length) {
      const ops = upserts.map(({ userId, role }) => ({
        updateOne: {
          filter: { formation: formationId, user: userId },
          update: { $set: { role } },
          upsert: true,
        },
      }));
      await FormationAffectation.bulkWrite(ops);
    }

    return res.json({ ok: true });
  }
);


/* -------------------------------------------------------------
   GET /affectations/mine-formations
------------------------------------------------------------- */
router.get(
  '/mine-formations',
  requireAuth,
  async (req, res) => {
    try {
      const userId = req.user.id;

      const rows = await FormationAffectation.find({
        user: userId,
        role: { $in: ['trainer', 'assistant', 'director', 'coach'] },
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

      const byFormation = new Map();

      for (const row of rows) {
        const f = row.formation;
        if (!f) continue;

        const fid = String(f._id);
        const current = byFormation.get(fid);

        // rôle brut renvoyé par l'affectation
        const role = (row.role || '').toLowerCase();

        // si on a déjà director, on ne descend jamais en dessous
        if (current && current.myRole === 'director') continue;

        // 👇 JS pur, plus de typage TS ici
        let r = 'trainer';

        if (role === 'director') {
          r = 'director';
        } else if (role === 'trainer') {
          r = 'trainer';
        } else if (role === 'assistant') {
          r = 'assistant';
        } else if (role === 'coach') {
          // à toi de décider : soit 'coach', soit 'trainer'
          r = 'coach';
        }

        const session = f.session || {};
        const sessionId =
          (session && session._id ? String(session._id) : null) ||
          (f.session ? String(f.session) : null);

        byFormation.set(fid, {
          formationId: fid,
          nom: f.nom || '',
          myRole: r, // 👈 ici tu auras bien 'assistant' quand l'affectation est assistant
          sessionTitle: session.title || '',
          startDate: session.startDate || f.startDate || null,
          endDate: session.endDate || f.endDate || null,
          centreTitle: f.centreTitleSnapshot || '',
          centreRegion: f.centreRegionSnapshot || '',
          sessionId,
        });
      }

      return res.json([...byFormation.values()]);
    } catch (e) {
      console.error('GET /affectations/mine-formations', e);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

/** POST /affectations/trainee-presence
 * Body: { items: [ { affectationId, isPresent }, ... ] }
 */
router.post(
  '/trainee-presence',
  requireAuth,
  async (req, res, next) => {
    try {
      const { items } = req.body || {};

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array is required' });
      }

      const ops = [];

      for (const it of items) {
        if (!it || !it.affectationId) continue;

        const isPresent = !!it.isPresent;

        ops.push({
          updateOne: {
            filter: {
              _id: it.affectationId,
              role: 'trainee',
            },
            update: {
              $set: { isPresent },
            },
          },
        });
      }

      if (ops.length === 0) {
        return res.status(400).json({ error: 'No valid items to update' });
      }

      const result = await FormationAffectation.bulkWrite(ops);
      const updated =
        (result.modifiedCount || 0) +
        (result.upsertedCount || 0) +
        (result.matchedCount || 0);

      /* ---- Initialiser Evaluation pour les stagiaires marqués présents ---- */
      const presentIds = items
        .filter(it => it && it.affectationId && it.isPresent)
        .map(it => it.affectationId);

      if (presentIds.length) {
        const affRows = await FormationAffectation.find({
          _id: { $in: presentIds },
          role: 'trainee',
        })
          .select('_id formation user')
          .populate({
            path: 'formation',
            select: '_id session',
          })
          .lean();

        const evalOps = [];

        for (const row of affRows) {
          if (!row.formation || !row.formation.session) continue;

          evalOps.push({
            updateOne: {
              filter: {
                formation: row.formation._id,
                session: row.formation.session,
                trainee: row.user,
              },
              update: {
                $setOnInsert: {
                  affectation: row._id,
                  status: 'draft',
                  items: [],
                },
              },
              upsert: true,
            },
          });
        }

        if (evalOps.length) {
          await Evaluation.bulkWrite(evalOps);
        }
      }

      return res.json({ ok: true, updated });
    } catch (err) {
      next(err);
    }
  }
);


module.exports = router;
