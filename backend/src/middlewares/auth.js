const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { hasWhatsApp } = require('../utils/whatsapp');
const NATIONAL = 'وطني';
const norm = s => String(s ?? '').normalize('NFC').replace(/\u200f|\u200e/g, '').trim();

// Les seules routes protégées accessibles pendant la complétion du profil.
// req.path peut être relatif au routeur, d'où originalUrl.
const ALLOWED_WITHOUT_WHATSAPP = new Set([
  '/api/auth/me',
  '/api/users/me/whatsapp',
]);

module.exports = async function requireAuth(req, res, next) {
  try {
    const h = String(req.headers.authorization || '');
    const token = h.startsWith('Bearer ') ? h.slice(7) : (req.cookies?.token || '');
    if (!token) return res.status(401).json({ error: 'Non authentifié' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (_) { return res.status(401).json({ error: 'Non authentifié' }); }
    const uid = payload.sub || payload.id || payload._id || payload.userId;
    if (!uid) return res.status(401).json({ error: 'Non authentifié' });
    const user = await User.findById(uid).select('_id email role region nom prenom idScout whatsapp').lean();
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const role = user.role;
    const region = norm(user.region);
    const requiresWhatsApp = !hasWhatsApp(user);
    req.user = {
      id: String(user._id), email: user.email, role, region,
      isAdmin: role === 'admin', isModerator: role === 'moderator',
      isNational: region === NATIONAL, nom: user.nom, prenom: user.prenom,
      idScout: user.idScout, whatsapp: user.whatsapp || null, requiresWhatsApp,
    };
    const path = req.originalUrl.split('?')[0].replace(/\/$/, '');
    if (requiresWhatsApp && !ALLOWED_WITHOUT_WHATSAPP.has(path)) {
      return res.status(403).json({
        error: 'يجب إضافة رقم واتساب قبل استخدام المنصة.',
        code: 'WHATSAPP_REQUIRED', requiresWhatsApp: true,
      });
    }
    return next();
  } catch (e) {
    console.error('[auth] unexpected:', e);
    return res.status(401).json({ error: 'Non authentifié' });
  }
};
