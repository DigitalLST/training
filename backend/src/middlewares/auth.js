// middlewares/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/user');

const NATIONAL = 'وطني';
const norm = s => (s ?? '')
  .normalize('NFC')
  .replace(/\u200f|\u200e/g, '')
  .trim();

module.exports = async function requireAuth(req, res, next) {
  try {
    // 1) Récup token (header ou cookie fallback)
    const h = String(req.headers.authorization || '');
    const token = h.startsWith('Bearer ') ? h.slice(7) : (req.cookies?.token || '');
    if (!token) {
      console.warn('[auth] no token');
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // 2) Vérif token
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (e) {
      console.error('[auth] jwt.verify failed:', e.name, e.message);
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // 3) ID utilisateur depuis le payload (tolérant)
    const uid = payload.sub || payload.id || payload._id || payload.userId;
    if (!uid) {
      console.error('[auth] no uid in payload:', payload);
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // 4) Recharge l'utilisateur en DB (vérité du rôle/région)
    const user = await User.findById(uid)
      .select('_id email role region nom prenom idScout')
      .lean();

    if (!user) {
      console.warn('[auth] user not found for uid=', uid);
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // 5) Expose dans req.user (avec booléens dérivés)
    const role = user.role;                 // 'user'|'moderator'|'admin'
    const region = norm(user.region);
    req.user = {
      id: String(user._id),
      email: user.email,
      role,
      region,
      isAdmin: role === 'admin',
      isModerator: role === 'moderator',
      isNational: region === NATIONAL,
      nom: user.nom,
      prenom: user.prenom,
      idScout: user.idScout,
    };

    // Debug light (désactive en prod si besoin)
    // console.log('[auth] OK user=', req.user);

    return next();
  } catch (e) {
    console.error('[auth] unexpected:', e);
    return res.status(401).json({ error: 'Non authentifié' });
  }
};
