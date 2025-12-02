// src/routes/me.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const User = require('../models/user');
const requireAuth = require('../middlewares/auth'); // adapte si le nom est différent

const router = express.Router();

/* -------------------------------------------------
 * Helper pour récupérer l'id utilisateur de manière robuste
 * ------------------------------------------------- */
function getUserIdFromRequest(req) {
  // On essaie plusieurs patterns possibles selon ton middleware auth
  if (req.user && (req.user._id || req.user.id)) {
    return (req.user._id || req.user.id).toString();
  }
  if (req.userId) {
    return req.userId.toString();
  }
  if (req.auth && (req.auth._id || req.auth.id)) {
    return (req.auth._id || req.auth.id).toString();
  }

  return null;
}

/* -------------------------------------------------
 * Dossier des signatures
 * ------------------------------------------------- */
const SIGNATURES_DIR =
  process.env.SIGNATURES_DIR ||
  path.join(__dirname, '..', 'uploads', 'signatures');

if (!fs.existsSync(SIGNATURES_DIR)) {
  fs.mkdirSync(SIGNATURES_DIR, { recursive: true });
}

/* -------------------------------------------------
 * GET /api/signatures/me
 * ------------------------------------------------- */
router.get('/signatures/me', requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Utilisateur non authentifié' });
    }

    const user = await User.findById(userId).select('signatureUrl').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.signatureUrl) {
      return res.json({
        hasSignature: true,
        signatureUrl: user.signatureUrl,
      });
    }

    return res.json({ hasSignature: false });
  } catch (err) {
    console.error('[signatures.me] GET error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/* -------------------------------------------------
 * POST /api/signatures/me
 * Body: { dataUrl: "data:image/png;base64,...." }
 * ------------------------------------------------- */
router.post('/signatures/me', requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Utilisateur non authentifié' });
    }

    const { dataUrl } = req.body;
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ message: 'dataUrl is required' });
    }

    const prefix = 'data:image/png;base64,';
    if (!dataUrl.startsWith(prefix)) {
      return res.status(400).json({ message: 'Invalid dataUrl format' });
    }

    const base64Data = dataUrl.slice(prefix.length);
    const buffer = Buffer.from(base64Data, 'base64');

    const fileName = `signature_${userId}.png`;
    const filePath = path.join(SIGNATURES_DIR, fileName);

    fs.writeFileSync(filePath, buffer);

    // URL publique (en supposant app.use('/uploads', ...) dans app.js)
    const publicUrl = `/uploads/signatures/${fileName}`;

    await User.findByIdAndUpdate(userId, { signatureUrl: publicUrl });

    return res.json({
      message: 'Signature saved',
      signatureUrl: publicUrl,
    });
  } catch (err) {
    console.error('[signatures.me] POST error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
