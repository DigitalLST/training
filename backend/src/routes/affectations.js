// routes/affectations.js
const express = require('express');
const { param, query, validationResult } = require('express-validator');
const requireAuth = require('../middlewares/auth');

const FormationAffectation = require('../models/affectation'); // ← modèle ci-dessus
const User       = require('../models/user');
const Demande    = require('../models/demande');
const Formation  = require('../models/formation');

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
 * -> [{ user:{_id,prenom,nom,email,idScout}, role }]
 */
router.get(
  '/formations/:formationId/affectations',
  requireAuth,
  [param('formationId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res); if (e) return;
    const { formationId } = req.params;

    const rows = await FormationAffectation.find({ formation: formationId })
      .select('_id user role')
      .populate({ path: 'user', select: '_id prenom nom email idScout' })
      .lean();

    res.json(rows.map(r => ({
      _id: String(r._id),
      role: r.role,
      user: r.user ? {
        _id: String(r.user._id),
        prenom: r.user.prenom,
        nom: r.user.nom,
        email: r.user.email,
        idScout: r.user.idScout
      } : null
    })));
  }
);

/** GET /affectations/formations/:formationId/candidates
 * Query:
 *  - role=trainer|director|trainee (obligatoire)
 *  - q=... (facultatif)
 *
 * Règles:
 *  - trainer/director: Users avec niveau ∈ { 'قائد تدريب','مساعد قائد تدريب' } (trim)
 *  - trainee: Demande.APPROVED sur la SESSION de la formation,
 *             avec trainingLevel == formation.niveau et branche ∈ formation.branches
 *  - Exclut déjà affectés à cette formation
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

    // Charger la formation (pour session/niveau/branches)
    const f = await Formation.findById(formationId)
      .select('session niveau branches')
      .lean();
    if (!f) return res.status(404).json({ error: 'Formation introuvable' });

    const sessionId = f.session;
    const formLevel = norm(f.niveau);
    const formBranches = (Array.isArray(f.branches) ? f.branches : []).map(norm).filter(Boolean);

    // Exclure déjà affectés à CETTE formation
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

      return res.json(out.slice(0, 25));
    }

    /* ===== TRAINEE ===== */
    // Demandes de la session de la formation, APPROVED
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

    return res.json(uniq.slice(0, 25));
  }
);

/** POST /affectations/formations/:formationId/affectations/diff
 * Body: { upserts:[{ userId, role }], deletes:[userId,...] }
 * - trainer/director: User.niveau ∈ {قائد تدريب, مساعد قائد تدريب}
 * - trainee: Demande.APPROVED dans la *session* de la formation
 *            ET trainingLevel == formation.niveau
 *            ET branche ∈ formation.branches
 */
router.post(
  '/formations/:formationId/affectations/diff',
  requireAuth,
  [param('formationId').isMongoId()],
  async (req, res) => {
    const e = bad(req, res); if (e) return;

    const { formationId } = req.params;
    const { upserts = [], deletes = [] } = req.body || {};

    // Charger formation (pour validations)
    const f = await Formation.findById(formationId).select('session niveau branches').lean();
    if (!f) return res.status(404).json({ error: 'Formation introuvable' });

    const sessionId   = f.session;
    const formLevel   = norm(f.niveau);
    const formBranches= (Array.isArray(f.branches) ? f.branches : []).map(norm).filter(Boolean);

    // deletes
    if (Array.isArray(deletes) && deletes.length) {
      await FormationAffectation.deleteMany({ formation: formationId, user: { $in: deletes } });
    }

    // validations + upserts
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

    // upserts (unique par (formation,user))
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

module.exports = router;
