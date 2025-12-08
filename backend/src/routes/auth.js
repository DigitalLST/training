// src/routes/auth.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const { signUser } = require('../utils/tokens');
const ResetToken = require('../models/ResetToken');
const requireAuth = require('../middlewares/auth');
const { sendResetMail } = require('../services/mailer'); // ✅ on réutilise le transporteur existant
const FormationAffectation = require('../models/affectation');

const router = express.Router();

// ---------- Utils ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// FRONT_URL sans slash final; si absent -> Origin de la requête -> localhost
function frontBase(req) {
  const env = (process.env.FRONT_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  const origin = (req.headers.origin || '').trim().replace(/\/+$/, '');
  if (origin) return origin;
  return 'http://localhost:5173';
}
// Retourne un JSON du user enrichi avec les flags de session
async function toAuthJson(user) {
  if (!user) return null;

  const [trainer, director,coach,assistant] = await Promise.all([
    FormationAffectation.exists({ user: user._id, role: 'trainer' }),
    FormationAffectation.exists({ user: user._id, role: 'director' }),
    FormationAffectation.exists({ user: user._id, role: 'coach' }),
    FormationAffectation.exists({ user: user._id, role: 'assistant' }),
  ]);

  const json = user.toJSON();
  json.isSessionTrainer = !!trainer;
  json.isSessionDirector = !!director;
  json.isSessionCoach = !!coach;
  json.isSessionAssistant = !!assistant;

  return json;
}
/**
 * POST /api/auth/register
 */
router.post(
  '/register',
  [
    body('nom').trim().notEmpty(),
    body('prenom').trim().notEmpty(),
    body('email').trim().isEmail().withMessage('Email invalide'),
    body('password').isString().trim().notEmpty().withMessage('Mot de passe requis').isLength({ min: 8 }),
    body('idScout').matches(/^[0-9]{10}$/),
    body('region').trim().notEmpty(),
    body('niveau').trim().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(422).json({ error: 'Invalid input', details: errors.array() });

    try {
      const exists = await User.findOne({
        $or: [{ email: req.body.email }, { idScout: req.body.idScout }],
      });
      if (exists) return res.status(409).json({ error: 'Email ou idScout déjà utilisé' });

      const user = new User(req.body);
      await user.save();

      const token = signUser(user);
      return res.status(201).json({ token, user: user.toJSON() });
    } catch (e) {
      if (e.code === 11000)
        return res.status(409).json({ error: 'Conflit: email ou idScout déjà utilisé' });
      return res.status(500).json({ error: 'Erreur serveur', details: e.message });
    }
  }
);

/**
 * POST /api/auth/login
 */
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('البريد الإلكتروني غير صالح'),
    body('password').isString().isLength({ min: 8 }).withMessage('كلمة السر يجب ألا تقل عن 8 أحرف'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(422).json({ error: 'Invalid input', details: errors.array() });

    const { email, password } = req.body;

    try {
      const user = await User.findOne({ email: (email || '').toLowerCase() });
      if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

      const ok = await user.comparePassword(password);
      if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

      const token = signUser(user);
      const authUser = await toAuthJson(user);
      return res.json({ token, user: authUser });
    } catch (e) {
      return res.status(500).json({ error: 'Erreur serveur', details: e.message });
    }
  }
);

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, async (req, res) => {
  const me = await User.findById(req.user.id);
  if (!me) return res.status(404).json({ error: 'Utilisateur introuvable' });

  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Vary', 'Authorization');
  const authUser = await toAuthJson(me);
  return res.json(authUser);
});

/**
 * POST /api/auth/forgot
 * Body: { email }
 * Réponse: { ok: true } (toujours 200 si user introuvable pour éviter l’énumération)
 */
router.post('/forgot', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email manquant' });

    const user = await User.findOne({ email }).select('_id email prenom nom').lean();

    // Toujours 200 pour ne pas révéler l’existence d’un compte
    if (!user) return res.json({ ok: true });

    // Invalider d’anciens tokens non utilisés
    await ResetToken.deleteMany({ user: user._id, used: false });

    // Générer un token aléatoire et stocker son hash (jamais le token brut)
    const raw = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(raw);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await ResetToken.create({ user: user._id, tokenHash, expiresAt, used: false });

    // URL de reset (ex: https://front/reset/<token>)
    const base = frontBase(req);
    const resetUrl = `${base}/reset/${raw}`;

    // Envoi de l’email via le service mailer (qui marche déjà)
    const displayName = `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email;
    await sendResetMail({ to: user.email, resetUrl, displayName });

    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /auth/forgot', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/auth/reset
 * Body: { token, password }
 */
router.post('/reset', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');

  if (!token || !password) return res.status(400).json({ error: 'Paramètres manquants' });  // Aligne la règle avec /login (8+)   if (password.length < 8) return res.status(422).json({ error: 'Mot de passe trop court (8+)' });

    const rec = await ResetToken.findOne({
      tokenHash: sha256(token),
      used: false,
      expiresAt: { $gt: new Date() },
    });
    if (!rec) return res.status(400).json({ error: 'Lien invalide ou expiré' });

    const user = await User.findById(rec.user);
    if (!user) return res.status(400).json({ error: 'Utilisateur introuvable' });

   // ✅ Laisse le pre-save hasher
    user.password = password;
    user.passwordChangedAt = new Date();
    await user.save();

    rec.used = true;
    await rec.save();

    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /auth/reset', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});


module.exports = router;
