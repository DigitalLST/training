// routes/affectations.js
const express = require('express');
const { param, query, validationResult } = require('express-validator');
const requireAuth = require('../middlewares/auth');

const FormationAffectation = require('../models/affectation');
const User       = require('../models/user');
const Demande    = require('../models/demande');
const Formation  = require('../models/formation');
const Evaluation  = require('../models/evaluation');
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

/** GET /affectations/formations/:formationId/affectations
 * -> [{ _id, role, isPresent, user:{_id,prenom,nom,email,idScout,region,certifsSnapshot} }]
 */
router.get(
  '/formations/:formationId/affectations',
  requireAuth,
  [param('formationId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res);
    if (e) return;

    const { formationId } = req.params;

    try {
      /* ---------- 1) Formation & session ---------- */
      const formation = await Formation.findById(formationId)
        .select('_id nom session')
        .lean();

      if (!formation) {
        return res.status(404).json({ error: 'Formation introuvable' });
      }

      const sessionId = formation.session;

      /* ---------- 2) Affectations (TOUS LES RÔLES) + user ---------- */
      const rows = await FormationAffectation.find({
        formation: formationId,
      })
        .select('_id user role isPresent')
        .populate({
          path: 'user',
          select: '_id prenom nom email idScout region',
        })
        .lean();

      const traineeUserIds = rows
        .filter(r => r.role === 'trainee' && r.user)
        .map(r => r.user._id)
        .filter(Boolean);

      // S’il n’y a pas de trainees, on renvoie quand même toutes les affectations
      if (traineeUserIds.length === 0) {
        return res.json(
          rows.map(r => ({
            _id: String(r._id),
            role: r.role,
            isPresent: !!r.isPresent,
            user: r.user
              ? {
                  _id: String(r.user._id),
                  prenom: r.user.prenom,
                  nom: r.user.nom,
                  email: r.user.email,
                  idScout: r.user.idScout,
                  region: r.user.region || null,
                  certifsSnapshot: [],
                }
              : null,
          }))
        );
      }

      /* ---------- 3) Demandes (applicant, session) pour les trainees ---------- */
      let demandes = [];
      if (sessionId) {
        demandes = await Demande.find({
          applicant: { $in: traineeUserIds },
          session: sessionId,
        })
          .select('applicant certifsSnapshot')
          .lean();
      }

      /* ---------- 4) Map applicant -> certifsSnapshot ---------- */
      const snapshotByUser = new Map();

      for (const d of demandes) {
        const uid = String(d.applicant);

        let snaps = [];
        if (Array.isArray(d.certifsSnapshot)) {
          snaps = d.certifsSnapshot.map(c => ({
            code: c.code,
            date: c.date || c.doneAt || c.completedAt || null,
            label: c.label || undefined,
          }));
        }

        const existing = snapshotByUser.get(uid) || [];
        snapshotByUser.set(uid, [...existing, ...snaps]);
      }

      /* ---------- 5) Payload finale ---------- */
      const payload = rows.map(r => {
        if (!r.user) {
          return {
            _id: String(r._id),
            role: r.role,
            isPresent: !!r.isPresent,
            user: null,
          };
        }

        const uid = String(r.user._id);
        // snapshots seulement pour les trainees ; vide pour les autres rôles
        const certifsSnapshot =
          r.role === 'trainee' ? (snapshotByUser.get(uid) || []) : [];

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
            certifsSnapshot,
          },
        };
      });

      return res.json(payload);
    } catch (err) {
      console.error(
        'GET /affectations/formations/:formationId/affectations ERROR',
        err
      );
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

/** GET /affectations/formations/:formationId/candidates
 * Query:
 *  - role=trainer|director|trainee (obligatoire)
 *  - q=... (facultatif)
 */
router.get(
  '/formations/:formationId/candidates',
  requireAuth,
  [
    param('formationId').isMongoId(),
    query('role').isIn(['trainer','director','trainee']),
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

    const sessionId = f.session;
    const formLevel = norm(f.niveau);
    const formBranches = (Array.isArray(f.branches) ? f.branches : []).map(norm).filter(Boolean);

    const already = await FormationAffectation.find({ formation: formationId }).select('user').lean();
    const excludeIds = new Set(already.map(a => String(a.user)));

    /* ===== TRAINER / DIRECTOR ===== */
    if (role === 'trainer' || role === 'director') {
      const match = {
        $expr: {
          $in: [
            { $trim: { input: { $ifNull: ['$niveau', ''] } } },
            ['قائد تدريب','مساعد قائد تدريب']
          ]
        }
      };
      if (re) {
        Object.assign(match, { $or: [{ email: re }, { idScout: re }, { nom: re }, { prenom: re }] });
      }

      const users = await User.find(match)
        .select('_id prenom nom email idScout')
        .limit(50)
        .lean();

      const out = users
        .filter(u => !excludeIds.has(String(u._id)))
        .map(u => ({ _id: String(u._id), prenom: u.prenom, nom: u.nom, email: u.email, idScout: u.idScout }));

      return res.json(out);
    }

    /* ===== TRAINEE ===== */
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
      if (excludeIds.has(String(u._id))) return false;

      if (norm(d.trainingLevel) !== formLevel) return false;
      const db = norm(d.branche);
      if (formBranches.length && !formBranches.includes(db)) return false;

      if (re) {
        return re.test(u.email || '') || re.test(u.idScout || '') || re.test(u.nom || '') || re.test(u.prenom || '');
      }
      return true;
    });

    const uniq = Object.values(
      filtered.reduce((acc, d) => {
        const u = d.applicant;
        const k = String(u?._id || '');
        if (k && !acc[k]) {
          acc[k] = { _id: k, prenom: u.prenom, nom: u.nom, email: u.email, idScout: u.idScout };
        }
        return acc;
      }, {})
    );

    return res.json(uniq);
  }
);

/** POST /affectations/formations/:formationId/affectations/diff */
router.post(
  '/formations/:formationId/affectations/diff',
  requireAuth,
  [param('formationId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res); if (e) return;

    const { formationId } = req.params;
    const { upserts = [], deletes = [] } = req.body || {};

    const f = await Formation.findById(formationId).select('session niveau branches').lean();
    if (!f) return res.status(404).json({ error: 'Formation introuvable' });

    const sessionId   = f.session;
    const formLevel   = norm(f.niveau);
    const formBranches= (Array.isArray(f.branches) ? f.branches : []).map(norm).filter(Boolean);

    if (Array.isArray(deletes) && deletes.length) {
      await FormationAffectation.deleteMany({ formation: formationId, user: { $in: deletes } });
    }

    for (const it of upserts) {
      const userId = it?.userId;
      const role   = it?.role;
      if (!userId || !role) return res.status(400).json({ error: 'userId et role requis' });

      if (role === 'trainer' || role === 'director') {
        const u = await User.findById(userId).select('_id niveau').lean();
        if (!u) return res.status(404).json({ error: 'User introuvable' });
        const nv = norm(u.niveau);
        if (!['قائد تدريب','مساعد قائد تدريب'].includes(nv)) {
          return res.status(400).json({ error: `Niveau utilisateur insuffisant pour rôle ${role}` });
        }
        continue;
      }

      if (role === 'trainee') {
        const d = await Demande.findOne({
          session: sessionId,
          applicant: userId,
          statusNational: 'APPROVED',
        }).select('trainingLevel branche').lean();

        if (!d) return res.status(400).json({ error: 'Demande APPROVED introuvable pour cet utilisateur' });
        if (norm(d.trainingLevel) !== formLevel) {
          return res.status(400).json({ error: 'Niveau de demande incompatible avec la formation' });
        }
        if (formBranches.length && !formBranches.includes(norm(d.branche))) {
          return res.status(400).json({ error: 'Branche de demande incompatible avec la formation' });
        }
      }
    }

    if (Array.isArray(upserts) && upserts.length) {
      const ops = upserts.map(({ userId, role }) => ({
        updateOne: {
          filter: { formation: formationId, user: userId },
          update: { $set: { role } },
          upsert: true,
        }
      }));
      if (ops.length) await FormationAffectation.bulkWrite(ops);
    }

    res.json({ ok: true });
  }
);

/** GET /affectations/mine-formations */
router.get(
  '/mine-formations',
  requireAuth,
  async (req, res) => {
    try {
      const userId = req.user.id;

      const rows = await FormationAffectation.find({
        user: userId,
        role: { $in: ['trainer', 'director'] },
      })
        .select('formation role')
        .populate({
          path: 'formation',
          select: 'nom centre centreTitleSnapshot centreRegionSnapshot session startDate endDate',
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

        const r = row.role === 'director' ? 'director' : 'trainer';
        if (current && current.myRole === 'director') {
          continue;
        }

        const session = f.session || {};

        let sessionId = undefined;
        if (session && session._id) {
          sessionId = String(session._id);
        } else if (f.session) {
          sessionId = String(f.session);
        }

        byFormation.set(fid, {
          formationId: fid,
          nom: f.nom || '',
          myRole: r,
          sessionTitle: session.title || '',
          startDate: (session.startDate || f.startDate) || null,
          endDate:   (session.endDate   || f.endDate)   || null,
          centreTitle: f.centreTitleSnapshot || '',
          centreRegion: f.centreRegionSnapshot || '',
          sessionId,
        });
      }

      return res.json(Array.from(byFormation.values()));
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
