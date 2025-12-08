const express = require('express');
const { body, validationResult, query, param } = require('express-validator');
const User = require('../models/user');
const requireAuth = require('../middlewares/auth');
const mongoose = require('mongoose'); 
const router = express.Router();



/* ===================== NOUVELLES ROUTES (AVANT /:id) ===================== */

/** GET /api/users/search?q=... */
router.get(
  '/search',
  requireAuth,
  [query('q').trim().isLength({ min: 1 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(422).json({ error: 'Invalid input', details: errors.array() });

    const q = String(req.query.q || '').trim();
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc, 'i');

    const or = [{ email: re }, { prenom: re }, { nom: re },{idScout: re}];
    if (/^\d{10}$/.test(q)) or.unshift({ idScout: q });

    const users = await User.find({ $or: or })
      .select('_id nom prenom email idScout isModerator isAdmin')
      .limit(10)
      .lean();

    res.set('Cache-Control', 'no-store, max-age=0');
    res.json(users);
  }
);




/* ===================== TES ROUTES EXISTANTES ===================== */

/** PATCH /api/users/me */
router.patch(
  '/me',
  requireAuth,
  [
    body('nom').optional().trim().notEmpty(),
    body('prenom').optional().trim().notEmpty(),
    body('region').optional().trim().notEmpty(),
    body('niveau').optional().trim().notEmpty(),
    body('idScout').optional().matches(/^[0-9]{10}$/),
    body('email').optional().isEmail().normalizeEmail(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(422).json({ error: 'Invalid input', details: errors.array() });

    const allowed = ['nom', 'prenom', 'region', 'niveau', 'idScout', 'email'];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

    try {
      if (updates.email) {
        const exists = await User.findOne({ email: updates.email, _id: { $ne: req.user.id } });
        if (exists) return res.status(409).json({ error: 'Email déjà utilisé' });
      }
      if (updates.idScout) {
        const exists = await User.findOne({ idScout: updates.idScout, _id: { $ne: req.user.id } });
        if (exists) return res.status(409).json({ error: 'idScout déjà utilisé' });
      }

      const me = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true });
      if (!me) return res.status(404).json({ error: 'Utilisateur introuvable' });

      res.set('Cache-Control', 'no-store, max-age=0');
      res.json(me.toJSON());
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

/** POST /api/users/me/password */
router.post(
  '/me/password',
  requireAuth,
  [body('oldPassword').isString(), body('newPassword').isLength({ min: 8 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(422).json({ error: 'Invalid input', details: errors.array() });

    const { oldPassword, newPassword } = req.body;
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const ok = await me.comparePassword(oldPassword);
    if (!ok) return res.status(401).json({ error: 'Ancien mot de passe incorrect' });

    me.password = newPassword; // hook pre('save') fera le hash
    await me.save();

    res.set('Cache-Control', 'no-store, max-age=0');
    res.json({ ok: true });
  }
);

/** GET /api/users/:id — restreint aux ObjectId pour ne pas intercepter /moderators */
router.get('/:id([0-9a-fA-F]{24})', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    res.set('Cache-Control', 'no-store, max-age=0');
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
/* ───────────────────────────── GET /api/users/me ─────────────────────────────
   Renvoie le profil en lecture seule (idscout, nom, prenom, email, region).
   Lit bien la colonne idScout en BDD et renvoie "idscout" normalisé dans la réponse.
*/
router.get('/me', requireAuth, async (req, res) => {
  try {
    const u = await User.findById(req.user.id)
      .select('_id email prenom nom idScout region')
      .lean();

    if (!u) return res.status(404).json({ error: 'User not found' });

    // Normaliser l’affichage de la région
    let regionName = '';
    try {
      if (u.region && typeof u.region === 'object' && !Array.isArray(u.region)) {
        regionName = u.region.name || u.region.nom || u.region.libelle || '';
      } else if (u.region && mongoose.Types.ObjectId.isValid(String(u.region))) {
        try {
          const Region = require('../models/region');
          const rg = await Region.findById(u.region).select('name nom libelle').lean();
          regionName = (rg?.name || rg?.nom || rg?.libelle || '').toString();
        } catch {
          regionName = String(u.region);
        }
      } else if (typeof u.region === 'string') {
        regionName = u.region;
      }
    } catch {
      regionName = '';
    }

    return res.json({
      _id: u._id,
      email: u.email || '',
      prenom: u.prenom || '',
      nom: u.nom || '',
      // 👇 lit idScout en BDD et renvoie "idscout" côté API
      idScout: (u.idScout !== undefined && u.idScout !== null) ? String(u.idScout) : '',
      region: regionName || '',
    });
  } catch (e) {
    console.error('GET /users/me', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* ───────────────────── POST /api/users/me/password ─────────────────────
   Body: { currentPassword, newPassword, confirmPassword }
   - Vérifie l’ancien mot de passe
   - Longueur minimale
   - Met à jour le hash
*/
router.post('/me/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Champs manquants' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(422).json({ error: 'Les mots de passe ne correspondent pas' });
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(422).json({ error: `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères` });
    }

    // password peut être select:false dans le schéma → on force la sélection
    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ok = await bcrypt.compare(String(currentPassword), String(user.password || ''));
    if (!ok) return res.status(403).json({ error: 'Mot de passe actuel invalide' });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(String(newPassword), salt);

    user.password = hash;
    await user.save();

    return res.json({ ok: true, message: 'Mot de passe mis à jour' });
  } catch (e) {
    console.error('POST /users/me/password', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

});

/**
 * GET /api/users/unassigned
 * Query:
 *   - q: recherche texte (nom/prénom/email)
 *   - page: numéro de page (1 par défaut)
 *   - limit: taille de page (50 par défaut)
 */
router.get('/unassigned', async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page ?? '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10), 1), 500);
    const skip  = (page - 1) * limit;
    const q     = (req.query.q || '').trim();

    // Filtre recherche optionnel (sur nom/prénom/email)
    const searchMatch = q
      ? {
          $or: [
            { firstName: { $regex: q, $options: 'i' } },
            { lastName:  { $regex: q, $options: 'i' } },
            { email:     { $regex: q, $options: 'i' } },
          ]
        }
      : {};

    // ⚠️ Assumptions:
    // - affectations.user est un ObjectId qui référence users._id
    // - Le nom de la collection est "affectations" (pluriel). Change "from" si différent.
    const pipeline = [
      // 1) Filtre de recherche (avant le lookup pour perf)
      { $match: searchMatch },

      // 2) Jointure gauche vers affectations
      {
        $lookup: {
          from: 'affectations',
          localField: '_id',
          foreignField: 'user',
          as: 'affects'
        }
      },

      // 3) On garde uniquement ceux qui n'ont pas d'affectation
      { $match: { affects: { $eq: [] } } },

      // 4) Projeter juste ce qu'il faut
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          fullName: {
            $trim: {
              input: { $concat: [{ $ifNull: ['$firstName',''] }, ' ', { $ifNull: ['$lastName',''] }] }
            }
          }
        }
      },

      // 5) Pagination + total via $facet
      {
        $facet: {
          items: [
            { $sort: { lastName: 1, firstName: 1, _id: 1 } },
            { $skip: skip },
            { $limit: limit }
          ],
          meta: [
            { $count: 'total' }
          ]
        }
      },
      {
        $project: {
          items: 1,
          total: { $ifNull: [{ $arrayElemAt: ['$meta.total', 0] }, 0] }
        }
      }
    ];

    const [result] = await User.aggregate(pipeline).allowDiskUse(true);
    const { items = [], total = 0 } = result || {};

    res.json({
      page,
      limit,
      total,
      items
    });
  } catch (err) {
    console.error('GET /api/users/unassigned error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});





/* ---------- helpers ---------- */

function bad(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) {
    console.error('Validation errors /users:', e.array());
    res.status(400).json({ errors: e.array() });
    return true;
  }
  return false;
}

function ensureAdmin(req, res) {
  const u = req.user;
  if (!u || u.role !== 'admin') {
    res.status(403).json({ message: 'Accès réservé aux administrateurs.' });
    return false;
  }
  return true;
}

/* ---------- GET /users/search ---------- */
/**
 * Utilisé pour l’autocomplete (ManageAdmins, etc.)
 * GET /users/search?q=...
 */
router.get(
  '/search',
  requireAuth,
  [query('q').optional().isString()],
  async (req, res) => {
    if (bad(req, res)) return;
    if (!ensureAdmin(req, res)) return;

    const q = (req.query.q || '').toString().trim();
    if (!q) {
      return res.json([]);
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    try {
      const users = await User.find({
        $or: [
          { prenom: regex },
          { nom: regex },
          { email: regex },
          { idScout: regex },
        ],
      })
        .select('prenom nom email idScout region niveau branche role adminAccess')
        .limit(20)
        .lean();

      const out = users.map(u => ({
        _id: u._id,
        prenom: u.prenom || '',
        nom: u.nom || '',
        email: u.email || '',
        idScout: u.idScout || '',
        region: u.region || '',
        niveau: u.niveau || '',
        branche: u.branche || '',
        role: u.role,
        adminAccess: u.adminAccess,
      }));

      return res.json(out);
    } catch (err) {
      console.error('GET /users/search ERROR', err);
      return res
        .status(500)
        .json({ message: 'Erreur serveur lors de la recherche d’utilisateurs.' });
    }
  }
);

/* ---------- GET /users ---------- */
/**
 * Liste complète des users (pour écran ManageUsers)
 * Optionnel: GET /users?q=... → filtre côté serveur
 */
router.get(
  '/',
  requireAuth,
  [query('q').optional().isString()],
  async (req, res) => {
    if (bad(req, res)) return;
    if (!ensureAdmin(req, res)) return;

    const q = (req.query.q || '').toString().trim();
    let filter = {};

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter = {
        $or: [
          { prenom: regex },
          { nom: regex },
          { email: regex },
          { idScout: regex },
          { region: regex },
          { niveau: regex },
          { branche: regex },
        ],
      };
    }

    try {
      const users = await User.find(filter)
        .select('prenom nom email idScout region niveau branche role adminAccess')
        .sort({ nom: 1, prenom: 1 })
        .lean();

      const out = users.map(u => ({
        _id: u._id,
        prenom: u.prenom || '',
        nom: u.nom || '',
        email: u.email || '',
        idScout: u.idScout || '',
        region: u.region || '',
        niveau: u.niveau || '',
        branche: u.branche || '',
        role: u.role,
        adminAccess: u.adminAccess,
      }));

      return res.json(out);
    } catch (err) {
      console.error('GET /users ERROR', err);
      return res
        .status(500)
        .json({ message: 'Erreur serveur lors de la lecture des utilisateurs.' });
    }
  }
);

/* ---------- PATCH /users/:id ---------- */
/**
 * PATCH /users/:id
 * Permet de modifier: prenom, nom, email, idScout, niveau, branche, region
 */
router.patch(
  '/:id',
  requireAuth,
  [
    param('id').isMongoId(),
    body('prenom').optional().isString(),
    body('nom').optional().isString(),
    body('email').optional().isEmail(),
    body('idScout').optional().isString(),
    body('niveau').optional().isString(),
    body('branche').optional().isString(),
    body('region').optional().isString(),
  ],
  async (req, res) => {
    if (bad(req, res)) return;
    if (!ensureAdmin(req, res)) return;

    const { id } = req.params;
    const { prenom, nom, email, idScout, niveau, branche, region } = req.body;

    const update = {};
    if (typeof prenom !== 'undefined') update.prenom = prenom;
    if (typeof nom !== 'undefined') update.nom = nom;
    if (typeof email !== 'undefined') update.email = email;
    if (typeof idScout !== 'undefined') update.idScout = idScout;
    if (typeof niveau !== 'undefined') update.niveau = niveau;
    if (typeof branche !== 'undefined') update.branche = branche;
    if (typeof region !== 'undefined') update.region = region;

    try {
      const user = await User.findByIdAndUpdate(
        id,
        { $set: update },
        { new: true }
      ).select('prenom nom email idScout region niveau branche role adminAccess');

      if (!user) {
        return res.status(404).json({ message: 'Utilisateur introuvable.' });
      }

      return res.json({
        _id: user._id,
        prenom: user.prenom || '',
        nom: user.nom || '',
        email: user.email || '',
        idScout: user.idScout || '',
        region: user.region || '',
        niveau: user.niveau || '',
        branche: user.branche || '',
        role: user.role,
        adminAccess: user.adminAccess,
      });
    } catch (err) {
      console.error('PATCH /users/:id ERROR', err);
      return res
        .status(500)
        .json({ message: 'Erreur serveur lors de la mise à jour de l’utilisateur.' });
    }
  }
);

/* ---------- DELETE /users/:id ---------- */
/**
 * Suppression d’un utilisateur.
 *
 * ⚠️ Si tu préfères un "soft delete", remplace par:
 *   - user.active = false; user.deletedAt = new Date(); user.save();
 */
router.delete(
  '/:id',
  requireAuth,
  [param('id').isMongoId()],
  async (req, res) => {
    if (bad(req, res)) return;
    if (!ensureAdmin(req, res)) return;

    const { id } = req.params;

    try {
      const user = await User.findByIdAndDelete(id);

      if (!user) {
        return res.status(404).json({ message: 'Utilisateur introuvable.' });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /users/:id ERROR', err);
      return res
        .status(500)
        .json({ message: 'Erreur serveur lors de la suppression de l’utilisateur.' });
    }
  }
);



module.exports = router;
