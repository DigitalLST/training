const express = require('express');
const { body, validationResult, query, param } = require('express-validator');
const User = require('../models/user');
const Demande = require('../models/demande');
const requireAuth = require('../middlewares/auth');
const mongoose = require('mongoose');
const { normalizeWhatsApp } = require('../utils/whatsapp');
const router = express.Router();

function bad(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(422).json({ error: 'Invalid input', details: errors.array() }); return true; }
  return false;
}
function ensureAdmin(req, res) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ message: 'Accès réservé aux administrateurs.' });
    return false;
  }
  return true;
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


// À placer dans routes/users.js, en remplacement
// de la route PATCH /me/whatsapp existante.

router.patch('/me/whatsapp', requireAuth, async (req, res) => {
  try {
    const whatsapp = normalizeWhatsApp(req.body || {});

    if (!whatsapp) {
      return res.status(422).json({
        code: 'WHATSAPP_INVALID',
        error: 'رقم واتساب غير صالح. يرجى التثبت من رمز البلد والرقم.'
      });
    }

    const existing = await User.findOne({
      whatsapp,
      _id: { $ne: req.user.id }
    }).select('_id').lean();

    if (existing) {
      return res.status(409).json({
        code: 'WHATSAPP_TAKEN',
        error: 'رقم واتساب هذا مستخدم بالفعل في حساب آخر.'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { whatsapp } },
      {
        new: true,
        runValidators: true
      }
    );

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    res.set('Cache-Control', 'no-store');

    return res.json({
      ok: true,
      whatsapp: user.whatsapp,
      requiresWhatsApp: false,
      user: user.toJSON()
    });

  } catch (error) {
    if (
      error.code === 11000 &&
      error.keyPattern?.whatsapp
    ) {
      return res.status(409).json({
        code: 'WHATSAPP_TAKEN',
        error: 'رقم واتساب هذا مستخدم بالفعل في حساب آخر.'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(422).json({
        code: 'WHATSAPP_INVALID',
        error: 'رقم واتساب غير صالح'
      });
    }

    console.error('PATCH /users/me/whatsapp', error);

    return res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});


// GET /api/users/search : recherche d'utilisateurs authentifiés (comportement initial).
router.get('/search', requireAuth, [query('q').trim().isLength({ min: 1 })], async (req, res) => {
  if (bad(req, res)) return;
  try {
    const q = String(req.query.q || '').trim();
    const re = new RegExp(esc(q), 'i');
    const or = [{ email: re }, { prenom: re }, { nom: re }, { idScout: re }];
    if (/^\d{10}$/.test(q)) or.unshift({ idScout: q });
    const users = await User.find({ $or: or }).select('_id nom prenom email idScout role region niveau whatsapp').limit(10).lean();
    res.set('Cache-Control', 'no-store, max-age=0');
    return res.json(users);
  } catch (e) { console.error('GET /users/search', e); return res.status(500).json({ error: 'Erreur serveur' }); }
});

// PATCH /api/users/me : mise à jour du profil courant.
router.patch('/me', requireAuth, [
  body('nom').optional().trim().notEmpty(), body('prenom').optional().trim().notEmpty(),
  body('region').optional().trim().notEmpty(), body('niveau').optional().trim().notEmpty(),
  body('idScout').optional().matches(/^[0-9]{10}$/), body('email').optional().isEmail().normalizeEmail(),
], async (req, res) => {
  if (bad(req, res)) return;
  const allowed = ['nom', 'prenom', 'region', 'niveau', 'idScout', 'email'];
  const updates = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  try {
    if (updates.email && await User.exists({ email: updates.email, _id: { $ne: req.user.id } })) return res.status(409).json({ error: 'Email déjà utilisé' });
    if (updates.idScout && await User.exists({ idScout: updates.idScout, _id: { $ne: req.user.id } })) return res.status(409).json({ error: 'idScout déjà utilisé' });
    const me = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true, runValidators: true });
    if (!me) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.set('Cache-Control', 'no-store, max-age=0');
    return res.json(me.toJSON());
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Email ou idScout déjà utilisé' });
    return res.status(400).json({ error: e.message });
  }
});

// GET /api/users/me : profil simplifié conservant le contrat existant.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select('_id email prenom nom idScout region whatsapp').lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    let regionName = '';
    try {
      if (u.region && typeof u.region === 'object' && !Array.isArray(u.region)) regionName = u.region.name || u.region.nom || u.region.libelle || '';
      else if (u.region && mongoose.Types.ObjectId.isValid(String(u.region))) {
        const Region = require('../models/region');
        const rg = await Region.findById(u.region).select('name nom libelle').lean();
        regionName = rg?.name || rg?.nom || rg?.libelle || String(u.region);
      } else regionName = String(u.region || '');
    } catch (_) { regionName = String(u.region || ''); }
    return res.json({ _id: u._id, email: u.email || '', prenom: u.prenom || '', nom: u.nom || '', idScout: u.idScout == null ? '' : String(u.idScout), region: regionName, whatsapp: u.whatsapp || null });
  } catch (e) { console.error('GET /users/me', e); return res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/users/me/password : accepte les deux formats historiques.
router.post('/me/password', requireAuth, [
  body('newPassword').isString().isLength({ min: 8 }),
], async (req, res) => {
  if (bad(req, res)) return;
  try {
    const currentPassword = req.body.currentPassword ?? req.body.oldPassword;
    const { newPassword, confirmPassword } = req.body;
    if (!currentPassword) return res.status(400).json({ error: 'Ancien mot de passe requis' });
    if (confirmPassword !== undefined && newPassword !== confirmPassword) return res.status(422).json({ error: 'Les mots de passe ne correspondent pas' });
    const me = await User.findById(req.user.id).select('+password');
    if (!me) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (!(await me.comparePassword(String(currentPassword)))) return res.status(403).json({ error: 'Mot de passe actuel invalide' });
    me.password = newPassword; // Le hook pre-save effectue le hash exactement une fois.
    await me.save();
    res.set('Cache-Control', 'no-store, max-age=0');
    return res.json({ ok: true, message: 'Mot de passe mis à jour' });
  } catch (e) { console.error('POST /users/me/password', e); return res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/users/unassigned : conserve la pagination et la recherche.
router.get('/unassigned', requireAuth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page ?? '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10) || 50, 1), 500);
    const q = String(req.query.q || '').trim();
    const searchMatch = q ? { $or: [
      { prenom: { $regex: esc(q), $options: 'i' } },
      { nom: { $regex: esc(q), $options: 'i' } },
      { email: { $regex: esc(q), $options: 'i' } },
    ] } : {};
    const pipeline = [
      { $match: searchMatch },
      { $lookup: { from: 'affectations', localField: '_id', foreignField: 'user', as: 'affects' } },
      { $match: { affects: { $eq: [] } } },
      { $project: { _id: 1, firstName: '$prenom', lastName: '$nom', fullName: { $trim: { input: { $concat: [{ $ifNull: ['$prenom', ''] }, ' ', { $ifNull: ['$nom', ''] }] } } } } },
      { $facet: { items: [{ $sort: { lastName: 1, firstName: 1, _id: 1 } }, { $skip: (page - 1) * limit }, { $limit: limit }], meta: [{ $count: 'total' }] } },
      { $project: { items: 1, total: { $ifNull: [{ $arrayElemAt: ['$meta.total', 0] }, 0] } } },
    ];
    const [result] = await User.aggregate(pipeline).allowDiskUse(true);
    const { items = [], total = 0 } = result || {};
    return res.json({ page, limit, total, items });
  } catch (e) { console.error('GET /users/unassigned', e); return res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/users : liste admin.
router.get('/', requireAuth, [query('q').optional().isString()], async (req, res) => {
  if (bad(req, res) || !ensureAdmin(req, res)) return;
  try {
    const q = String(req.query.q || '').trim();
    const filter = q ? { $or: ['prenom', 'nom', 'email', 'idScout', 'region', 'niveau', 'branche'].map(k => ({ [k]: { $regex: esc(q), $options: 'i' } })) } : {};
    const users = await User.find(filter).select('prenom nom email idScout region niveau branche role adminAccess whatsapp').sort({ nom: 1, prenom: 1 }).lean();
    return res.json(users.map(u => ({ _id: u._id, prenom: u.prenom || '', nom: u.nom || '', email: u.email || '', idScout: u.idScout || '', region: u.region || '', niveau: u.niveau || '', branche: u.branche || '', role: u.role, adminAccess: u.adminAccess, whatsapp: u.whatsapp || null })));
  } catch (e) { console.error('GET /users', e); return res.status(500).json({ error: 'Erreur serveur lors de la lecture des utilisateurs.' }); }
});

// GET /api/users/:id : restreint aux ObjectId, comportement public historique.
router.get('/:id([0-9a-fA-F]{24})', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.set('Cache-Control', 'no-store, max-age=0');
    return res.json(user);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// PATCH /api/users/:id : édition administrateur.
router.patch('/:id', requireAuth, [
  param('id').isMongoId(), body('prenom').optional().isString(), body('nom').optional().isString(),
  body('email').optional().isEmail(), body('idScout').optional().matches(/^[0-9]{10}$/),
  body('niveau').optional().isString(), body('branche').optional().isString(), body('region').optional().isString(),
  body('whatsapp').optional().isString(),
], async (req, res) => {
  if (bad(req, res) || !ensureAdmin(req, res)) return;
  const allowed = ['prenom', 'nom', 'email', 'idScout', 'niveau', 'branche', 'region'];
  const update = {};
  for (const key of allowed) if (req.body[key] !== undefined) update[key] = String(req.body[key]).trim();
  if (update.email) update.email = update.email.toLowerCase();
  if (req.body.whatsapp !== undefined) {
    const whatsapp = normalizeWhatsApp({ whatsapp: req.body.whatsapp });
    if (!whatsapp) return res.status(422).json({ code: 'WHATSAPP_INVALID', error: 'رقم واتساب غير صالح.' });
    update.whatsapp = whatsapp;
  }
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true }).select('prenom nom email idScout region niveau branche role adminAccess whatsapp');
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });
    await Demande.updateMany({ applicant: user._id }, { $set: {
      'applicantSnapshot.idScout': user.idScout || '',
      'applicantSnapshot.firstName': user.prenom || '',
      'applicantSnapshot.lastName': user.nom || '',
      'applicantSnapshot.email': user.email || '',
      'applicantSnapshot.region': user.region || '',
    } });
    return res.json({ _id: user._id, prenom: user.prenom || '', nom: user.nom || '', email: user.email || '', idScout: user.idScout || '', region: user.region || '', niveau: user.niveau || '', branche: user.branche || '', role: user.role, adminAccess: user.adminAccess, whatsapp: user.whatsapp || null });
  } catch (e) {
    console.error('PATCH /users/:id', e);
    if (e.code === 11000) return res.status(409).json(e.keyPattern?.whatsapp ? { code: 'WHATSAPP_TAKEN', error: 'رقم واتساب هذا مستخدم بالفعل في حساب آخر.' } : { message: 'Email ou identifiant scout déjà utilisé.' });
    return res.status(500).json({ message: 'Erreur serveur lors de la mise à jour de l’utilisateur.' });
  }
});

router.delete('/:id', requireAuth, [param('id').isMongoId()], async (req, res) => {
  if (bad(req, res) || !ensureAdmin(req, res)) return;
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });
    return res.json({ ok: true });
  } catch (e) { console.error('DELETE /users/:id', e); return res.status(500).json({ message: 'Erreur serveur lors de la suppression de l’utilisateur.' }); }
});
module.exports = router;
