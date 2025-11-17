// routes/dev.seed.demandes.byIdScout.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const Session = require('../models/session');
const User = require('../models/user');
const Demande = require('../models/demande');
const jwt = require('jsonwebtoken');
const router = express.Router();
// const requireAuth = require('../middlewares/auth'); // <- en dev, tu peux commenter

// --- listes de valeurs ---
const ALLOWED_LEVELS = new Set(['تمهيدية','شارة خشبية']);
const ALLOWED_BRANCH  = new Set(['رواد','جوالة','دليلات','كشافة','مرشدات','أشبال','زهرات','عصافير']);

// --- helpers dates ---
function isDateValid(d) { return d instanceof Date && !Number.isNaN(d.getTime()); }
function buildServiceToken() {
  return jwt.sign(
    { iss: 'training-backend', aud: 'etraining-internal', scopes: ['etraining.read'] },
    process.env.S2S_JWT_SECRET,
    { expiresIn: '5m' }
  );
}
// --- fetch upstream e-training (réel, tolérant) ---
async function fetchCertifsByIdKachefa(idKachefa) {
  const base = process.env.ETRAINING_INTERNAL_BASE || process.env.ETRAINING_BASE_URL;
  if (!base) throw new Error('Missing ETRAINING_BASE_URL env var');
  const token = buildServiceToken();
  const url = `${base.replace(/\/$/, '')}/api/internal/v1/etraining/users/by-idkachefa/${encodeURIComponent(idKachefa)}/certifs`;

  // Timeout soft (7s)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);

  try {
    // Log utile pour vérifier les hits côté e-training
    console.log('[e-training] GET', url);

    const resp = await fetch(url, {
      headers: { 'x-access-token': token },
      signal: ctrl.signal,
    });

    if (resp.status === 404) return []; // pas de certifs connus → snapshot vide
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`e-training ${resp.status} ${txt}`);
    }

    const json = await resp.json();
    const certifs = Array.isArray(json?.certifs) ? json.certifs : [];

    // Snapshot minimal (ta structure)
    return certifs.map(c => ({
      title: String(c?.certificationTitle ?? ''),  // ← ton champ source
      code:  String(c?.code ?? ''),
      // garde un Date si present, sinon null (ton schema accepte Date)
      date:  c?.date ? new Date(c.date) : null,
    }));
  } catch (e) {
    // même politique que ta route authentifiée: on log et on ne bloque pas
    console.error('[e-training fetchCertifs] fail for', idKachefa, String(e?.message || e));
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// normalise le snapshot (structure minimale et champs string)
function normalizeCertifsSnapshot(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => ({
    title: String(x?.title ?? '').trim(),
    code:  String(x?.code  ?? '').trim(),
    date:  String(x?.date  ?? '').trim(),
  })).filter(x => x.title || x.code || x.date);
}

// --- helpers session ---
async function resolveSessionByTitle(sessionTitle) {
  const t = String(sessionTitle || '').trim();
  if (!t) return null;
  const s = await Session.findOne({ title: new RegExp(`^${t}$`, 'i') })
    .select('_id title trainingLevels branche branches inscriptionStartDate inscriptionEndDate')
    .lean();
  return s || null;
}
function okTrainingLevelForSession(s, lvl) {
  const arr = Array.isArray(s?.trainingLevels) ? s.trainingLevels : [];
  return arr.map(String).includes(String(lvl));
}
function okBrancheForSession(s, branche) {
  const raw = Array.isArray(s?.branches) ? s.branches : Array.isArray(s?.branche) ? s.branche : [];
  const allowed = raw.map(x => String(x).trim());
  return allowed.includes(String(branche).trim());
}


/* ===================== SINGLE ===================== */
/**
 * POST /api/dev/seed/demandes-by-idscout
 * body: { sessionTitle, trainingLevel, branche, idScout }
 */
router.post(
  '/demandes-by-idscout',
  // requireAuth, // en dev tu peux le retirer
  [
    body('sessionTitle').isString().trim().notEmpty(),
    body('trainingLevel').isString().custom(v => ALLOWED_LEVELS.has(v)),
    body('branche').isString().custom(v => ALLOWED_BRANCH.has(v)),
    body('idScout').isString().matches(/^\d{10}$/),  // garde les zéros
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sessionTitle, trainingLevel, branche, idScout } = req.body;

    try {
      // session par titre
      const s = await resolveSessionByTitle(sessionTitle);
      if (!s) return res.status(404).json({ error: 'Session introuvable (via sessionTitle)' });

      // contrôles de cohérence session
      if (!okTrainingLevelForSession(s, trainingLevel)) {
        return res.status(400).json({ error: 'trainingLevel non disponible pour cette session' });
      }
      if (!okBrancheForSession(s, branche)) {
        return res.status(400).json({ error: 'branche non disponible pour cette session' });
      }

      // fenêtre d’inscription (même logique que ta route authentifiée)
      const now = new Date();
      const start = s.inscriptionStartDate ? new Date(s.inscriptionStartDate) : null;
      const end   = s.inscriptionEndDate   ? new Date(s.inscriptionEndDate)   : null;
      if (isDateValid(start) && now < start) return res.status(400).json({ error: 'Registration not opened yet' });
      if (isDateValid(end)   && now > end)   return res.status(400).json({ error: 'Registration closed' });

      // cherche l’utilisateur par idScout (string)
      const u = await User.findOne({ idScout: String(idScout) }).lean();
      if (!u) return res.status(404).json({ error: 'User introuvable (idScout)' });

      // snapshot certifs — EXACTEMENT comme ta route authentifiée
      let certifsSnapshot = [];
      try {
        if (idScout && /^\d{10}$/.test(String(idScout))) {
          const raw = await fetchCertifsByIdKachefa(String(idScout));
          certifsSnapshot = normalizeCertifsSnapshot(raw);
        }
      } catch (e) {
        console.error('[e-training sync] failed:', e?.message || e);
        certifsSnapshot = [];
      }

      const doc = await Demande.create({
        session: s._id,
        applicant: u._id,
        applicantSnapshot: {
          idScout:  String(idScout),
          firstName: u.prenom || u.firstName || u.firstname || '',
          lastName:  u.nom    || u.lastName  || u.lastname  || '',
          email:     u.email  || '',
          region:    u.region || '',
        },
        certifsSnapshot, // snapshot minimal (title/code/date)
        trainingLevel,
        branche,
        statusRegion: 'APPROVED',
        statusNational: 'APPROVED',
      });

      return res.status(201).json({
        ok: true,
        demande: { _id: String(doc._id), certifsSnapshot: doc.certifsSnapshot }
      });
    } catch (err) {
      if (err?.code === 11000) return res.status(409).json({ error: 'Demande déjà existante pour cette session' });
      next(err);
    }
  }
);

/* ===================== BULK ===================== */
/**
 * POST /api/dev/seed/demandes-by-idscout/bulk
 * body: { sessionTitle, trainingLevel, branche, idScouts: [ "0800003303", ... ] }
 */
router.post(
  '/demandes-by-idscout/bulk',
  // requireAuth, // en dev tu peux le retirer
  [
    body('sessionTitle').isString().trim().notEmpty(),
    body('trainingLevel').isString().custom(v => ALLOWED_LEVELS.has(v)),
    body('branche').isString().custom(v => ALLOWED_BRANCH.has(v)),
    body('idScouts').isArray({ min: 1 }),
    body('idScouts.*').isString().matches(/^\d{10}$/), // string 10 chiffres
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sessionTitle, trainingLevel, branche, idScouts } = req.body;

    try {
      // session par titre
      const s = await resolveSessionByTitle(sessionTitle);
      if (!s) return res.status(404).json({ error: 'Session introuvable (via sessionTitle)' });

      // cohérence session
      if (!okTrainingLevelForSession(s, trainingLevel)) {
        return res.status(400).json({ error: 'trainingLevel non disponible pour cette session' });
      }
      if (!okBrancheForSession(s, branche)) {
        return res.status(400).json({ error: 'branche non disponible pour cette session' });
      }

      // fenêtre d’inscription
      const now = new Date();
      const start = s.inscriptionStartDate ? new Date(s.inscriptionStartDate) : null;
      const end   = s.inscriptionEndDate   ? new Date(s.inscriptionEndDate)   : null;
      if (isDateValid(start) && now < start) return res.status(400).json({ error: 'Registration not opened yet' });
      if (isDateValid(end)   && now > end)   return res.status(400).json({ error: 'Registration closed' });

      // users par idScout
      const users = await User.find({ idScout: { $in: idScouts.map(String) } })
        .select('_id idScout prenom firstName firstname nom lastName lastname email region')
        .lean();
      const byScout = new Map(users.map(u => [String(u.idScout), u]));

      const results = [];
      for (const idScout of idScouts) {
        const u = byScout.get(String(idScout));
        if (!u) {
          results.push({ idScout, status: 'skipped', reason: 'user_not_found' });
          continue;
        }

        // snapshot certifs — même logique try/catch tolérante
        let certifsSnapshot = [];
        try {
          if (idScout && /^\d{10}$/.test(String(idScout))) {
            const raw = await fetchCertifsByIdKachefa(String(idScout));
            certifsSnapshot = normalizeCertifsSnapshot(raw);
          }
        } catch (e) {
          console.error('[e-training sync] failed:', e?.message || e);
          certifsSnapshot = [];
        }

        try {
          const doc = await Demande.create({
            session: s._id,
            applicant: u._id,
            applicantSnapshot: {
              idScout:  String(idScout),
              firstName: u.prenom || u.firstName || u.firstname || '',
              lastName:  u.nom    || u.lastName  || u.lastname  || '',
              email:     u.email  || '',
              region:    u.region || '',
            },
            certifsSnapshot,
            trainingLevel,
            branche,
            statusRegion: 'PENDING',
            statusNational: 'PENDING',
          });
          results.push({ idScout, status: 'created', id: String(doc._id) });
        } catch (e) {
          if (e?.code === 11000) {
            results.push({ idScout, status: 'duplicate' });
          } else {
            results.push({ idScout, status: 'error', error: String(e?.message || e) });
          }
        }
      }

      return res.json({
        ok: true,
        sessionId: String(s._id),
        sessionTitle: s.title,
        results
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
