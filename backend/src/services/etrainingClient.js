// services/etrainingClient.js (training)
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

function buildServiceToken() {
  return jwt.sign(
    { iss: 'training-backend', aud: 'etraining-internal', scopes: ['etraining.read'] },
    process.env.S2S_JWT_SECRET,
    { expiresIn: '5m' }
  );
}

async function fetchCertifsByIdKachefa(idKachefa) {
  const token = buildServiceToken();
  const url = `${process.env.ETRAINING_BASE_URL}/api/internal/v1/etraining/users/by-idkachefa/${encodeURIComponent(idKachefa)}/certifs`;
  const r = await fetch(url, { headers: { 'x-access-token': token } });
  if (!r.ok) throw new Error(`e-training ${r.status} ${await r.text()}`);
  const { certifs = [] } = await r.json();
  // ⬇︎ on ne garde que title/date/code
  return certifs.map(c => ({
    title: c.certificationTitle ?? '',
    code:  c.code ?? '',
    date:  c.date ? new Date(c.date) : null,
  }));
}

module.exports = { fetchCertifsByIdKachefa };
