// middlewares/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/user');

module.exports = async function requireAuth(req, res, next) {
  try {
    console.log('[auth] 1 enter');
    const h = String(req.headers.authorization || '');
    if (!h.startsWith('Bearer ')) {
      console.warn('[auth] 2 no bearer');
      return res.status(401).json({ error: 'Non authentifié' });
    }
    const token = h.slice(7);
    console.log('[auth] 3 got bearer, len=', token.length);

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      console.log('[auth] 4 verified, payload=', payload);
    } catch (e) {
      console.error('[auth] 4b verify failed:', e.name, e.message);
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const uid = payload.id || payload._id || payload.userId;
    console.log('[auth] 5 uid=', uid);
    if (!uid) {
      console.error('[auth] 5b no uid in payload');
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const user = await User.findById(uid).select('_id email isAdmin isModerator isSuperAdmin').lean();
    console.log('[auth] 6 userFound=', !!user);
    if (!user) {
      console.warn('[auth] 6b user not found in DB for uid=', uid);
      return res.status(401).json({ error: 'Non authentifié' });
    }

    req.user = { id: String(user._id), email: user.email, isAdmin: !!user.isAdmin, isModerator: !!user.isModerator, isSuperAdmin: !!user.isSuperAdmin };
    console.log('[auth] 7 next with user=', req.user);
    return next();
  } catch (e) {
    console.error('[auth] 8 unexpected:', e);
    return res.status(401).json({ error: 'Non authentifié' });
  }
};
