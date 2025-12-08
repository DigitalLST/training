// services/signatoryMandates.js
const SignatoryMandate = require('../models/signatoryMandate');

/**
 * Params:
 *  - userId: ObjectId (ou string)
 *  - type: 'cn_president' | 'cn_commissioner' | 'regional_president'
 *  - startDate: 'YYYY-MM-DD' ou Date
 *  - region?: string (obligatoire si type = 'regional_president')
 *
 * Règles:
 *  - Clôture tout mandat actif (endDate: null) de ce type
 *    (et même région si régional)
 *  - Crée un nouveau mandat avec startDate, endDate = null
 */
async function createMandate({ userId, type, startDate, region }) {
  if (!userId) {
    throw new Error('createMandate: userId manquant');
  }
  if (!type) {
    throw new Error('createMandate: type manquant');
  }
  if (!startDate) {
    throw new Error('createMandate: startDate manquante');
  }

  // parsing de la date
  let start;
  if (startDate instanceof Date) {
    start = startDate;
  } else if (typeof startDate === 'string') {
    // on force à minuit UTC
    start = new Date(`${startDate}T00:00:00.000Z`);
  } else {
    throw new Error('createMandate: startDate invalide');
  }

  if (Number.isNaN(start.getTime())) {
    throw new Error('createMandate: startDate non parsable');
  }

  // Pour les mandats régionaux → region obligatoire
  if (type === 'regional_president' && !region) {
    throw new Error('createMandate: region requise pour un mandat régional');
  }

  // 1) Clôturer tout mandat actif de ce type (et région le cas échéant)
  const closeFilter = {
    type,
    endDate: null,
  };

  if (type === 'regional_president') {
    closeFilter.region = region;
  }

  await SignatoryMandate.updateMany(closeFilter, {
    $set: { endDate: start },
  });

  // 2) Créer le nouveau mandat
  const mandate = await SignatoryMandate.create({
    user: userId,
    type,
    region: type === 'regional_president' ? region : undefined,
    startDate: start,
    endDate: null,
  });

  return mandate;
}

module.exports = {
  createMandate,
};
