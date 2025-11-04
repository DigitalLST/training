'use strict';

const jwt = require('jsonwebtoken');
const xss = require('xss');
const User = require('../models/user');
const { sendContactUsEmail } = require('../services/mailer');

async function getAuthedUser(req) {
  try {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    const payload = jwt.verify(m[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const uid = payload?.id || payload?._id || payload?.userId;
    if (!uid) return null;
    const u = await User.findById(uid).select('_id email prenom nom').lean();
    return u ? { id: String(u._id), email: u.email || '', prenom: u.prenom || '', nom: u.nom || '' } : null;
  } catch { return null; }
}
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());

exports.sendContactEmail = async (req, res) => {
  try {
    const subject = xss(String(req.body.subject || '').trim());
    const text = xss(String(req.body.text || req.body.message || '').trim());
    if (!subject) return res.status(400).json({ message: 'Email Subject Is Empty' });
    if (!text || text.length < 10) return res.status(400).json({ message: 'Email Body Is Empty' });

    const auth = await getAuthedUser(req);
    let email  = (auth?.email || req.body.email || '').trim().toLowerCase();
    let prenom = (auth?.prenom || req.body.prenom || req.body.firstName || '').trim();
    let nom    = (auth?.nom    || req.body.nom    || req.body.lastName  || '').trim();

    if (auth?.id && (!email || !prenom || !nom)) {
      const u = await User.findById(auth.id).select('email prenom nom').lean();
      if (u) { email ||= String(u.email||'').toLowerCase(); prenom ||= String(u.prenom||''); nom ||= String(u.nom||''); }
    }
    if (email && (!prenom || !nom)) {
      const u2 = await User.findOne({ email }).select('prenom nom').lean();
      if (u2) { prenom ||= String(u2.prenom||''); nom ||= String(u2.nom||''); }
    }

    const ok = await sendContactUsEmail({
      subject, text, email, firstName: prenom, lastName: nom,
      meta: {
        userId: auth?.id || null,
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
        ua: req.headers['user-agent'] || null,
        path: req.originalUrl,
        at: new Date().toISOString(),
      },
    });
    if (!ok) return res.status(500).json({ message: 'Error Sending Email' });

    res.status(201).json({ ok: true, authed: !!auth, sender: { email: email || null, prenom: prenom || null, nom: nom || null } });
  } catch (e) {
    console.error('sendContactEmail controller error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};
