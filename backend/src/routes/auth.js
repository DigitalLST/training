const express = require('express');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const User = require('../models/user');
const { signUser } = require('../utils/tokens');
const { normalizeWhatsApp, hasWhatsApp } = require('../utils/whatsapp');
const ResetToken = require('../models/ResetToken');
const requireAuth = require('../middlewares/auth');
const { sendResetMail } = require('../services/mailer');
const FormationAffectation = require('../models/affectation');
const router = express.Router();
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
function frontBase(req) {
  return String(process.env.FRONT_URL || req.headers.origin || 'http://localhost:5173').trim().replace(/\/+$/, '');
}
async function toAuthJson(user) {
  if (!user) return null;
  const [trainer, director, coach, assistant] = await Promise.all([
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
  json.requiresWhatsApp = !hasWhatsApp(user);
  return json;
}

// POST /api/auth/register
router.post('/register', [
  body('nom').trim().notEmpty(),
  body('prenom').trim().notEmpty(),
  body('email').trim().isEmail().withMessage('Email invalide'),
  body('password').isString().isLength({ min: 8 }),
  body('idScout').matches(/^[0-9]{10}$/),
  body('region').trim().notEmpty(),
  body('niveau').trim().notEmpty(),
  body().custom(value => {
    if (!normalizeWhatsApp(value)) throw new Error('رقم واتساب غير صالح أو مفقود');
    return true;
  }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Invalid input', details: errors.array() });
  try {
    const email = String(req.body.email).trim().toLowerCase();
    const whatsapp = normalizeWhatsApp(req.body);
    const exists = await User.findOne({ $or: [{ email }, { idScout: req.body.idScout }, { whatsapp }] });
    if (exists) {
  console.log('REGISTER CONFLICT:', {
    existingId: exists._id,
    sameEmail: exists.email === email,
    sameIdScout: exists.idScout === req.body.idScout,
    sameWhatsApp: exists.whatsapp === whatsapp
  });

  if (exists.whatsapp === whatsapp) {
    return res.status(409).json({
      code: 'WHATSAPP_TAKEN',
      error: 'رقم واتساب هذا مستخدم بالفعل في حساب آخر.'
    });
  }

  return res.status(409).json({
    code: 'ACCOUNT_ALREADY_EXISTS',
    error: 'البريد الإلكتروني أو المعرف الكشفي مستخدم بالفعل'
  });
}
    // Liste explicite : pas d'injection de role ou de propriétés sensibles via req.body.
    const { nom, prenom, password, idScout, region, niveau } = req.body;
    const user = new User({ nom, prenom, email, password, idScout, region, niveau, whatsapp });
    await user.save();
    return res.status(201).json({ token: signUser(user), user: await toAuthJson(user) });
  } catch (e) {
    if (e.code === 11000) {
      if (e.keyPattern?.whatsapp) return res.status(409).json({ code: 'WHATSAPP_TAKEN', error: 'رقم واتساب هذا مستخدم بالفعل في حساب آخر.' });
      return res.status(409).json({ error: 'Conflit: email ou idScout déjà utilisé' });
    }
    console.error('POST /auth/register', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().withMessage('البريد الإلكتروني غير صالح'),
  body('password').isString().isLength({ min: 8 }).withMessage('كلمة السر يجب ألا تقل عن 8 أحرف'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Invalid input', details: errors.array() });
  try {
    const user = await User.findOne({ email: String(req.body.email).trim().toLowerCase() });
    if (!user || !(await user.comparePassword(req.body.password))) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    return res.json({ token: signUser(user), user: await toAuthJson(user) });
  } catch (e) {
    console.error('POST /auth/login', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me (autorisé même sans WhatsApp)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.set({ 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', Expires: '0', Vary: 'Authorization' });
    return res.json(await toAuthJson(me));
  } catch (e) {
    console.error('GET /auth/me', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/forgot
router.post('/forgot', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email manquant' });
    const user = await User.findOne({ email }).select('_id email prenom nom').lean();
    if (!user) return res.json({ ok: true });
    await ResetToken.deleteMany({ user: user._id, used: false });
    const raw = crypto.randomBytes(32).toString('hex');
    await ResetToken.create({ user: user._id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3600000), used: false });
    const resetUrl = `${frontBase(req)}/reset/${raw}`;
    const displayName = `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email;
    await sendResetMail({ to: user.email, resetUrl, displayName });
    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /auth/forgot', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/reset
router.post('/reset', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    if (!token || !password) return res.status(400).json({ error: 'Paramètres manquants' });
    if (password.length < 8) return res.status(422).json({ error: 'Mot de passe trop court (8+)' });
    const rec = await ResetToken.findOne({ tokenHash: sha256(token), used: false, expiresAt: { $gt: new Date() } });
    if (!rec) return res.status(400).json({ error: 'Lien invalide ou expiré' });
    const user = await User.findById(rec.user);
    if (!user) return res.status(400).json({ error: 'Utilisateur introuvable' });
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
