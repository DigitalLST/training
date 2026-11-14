
// utils/whatsapp.js

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

function normalizeWhatsApp(input = {}) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const { whatsapp, countryCode, phoneNumber } = input;

  let code;
  let local;

  // Cas 1 : numéro international complet
  if (whatsapp !== undefined && whatsapp !== null) {
    if (typeof whatsapp !== 'string') return null;

    const value = whatsapp.replace(/[\s().-]/g, '');

    if (!E164_REGEX.test(value)) return null;

    // Validation spécifique France
    if (value.startsWith('+33')) {
      const national = value.slice(3);
      return /^[1-9]\d{8}$/.test(national)
        ? value
        : null;
    }

    // Validation spécifique Tunisie
    if (value.startsWith('+216')) {
      const national = value.slice(4);
      return /^\d{8}$/.test(national)
        ? value
        : null;
    }

    return value;
  }

  // Cas 2 : indicatif et numéro séparés
  code = String(countryCode || '+216')
    .replace(/[\s().-]/g, '');

  local = String(phoneNumber ?? '')
    .replace(/[\s().-]/g, '');

  if (!/^\+[1-9]\d{0,2}$/.test(code)) {
    return null;
  }

  if (!local || !/^\d+$/.test(local)) {
    return null;
  }

  // France : 06XXXXXXXX -> +336XXXXXXXX
  if (code === '+33') {
    if (local.startsWith('0')) {
      local = local.slice(1);
    }

    if (!/^[1-9]\d{8}$/.test(local)) {
      return null;
    }
  }

  // Tunisie : exactement 8 chiffres
  if (code === '+216') {
    if (!/^\d{8}$/.test(local)) {
      return null;
    }
  }

  const normalized = code + local;

  if (!E164_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
}

function hasWhatsApp(user) {
  if (!user || typeof user.whatsapp !== 'string') {
    return false;
  }

  return normalizeWhatsApp({
    whatsapp: user.whatsapp
  }) !== null;
}

module.exports = {
  normalizeWhatsApp,
  hasWhatsApp
};
