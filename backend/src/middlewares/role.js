// middlewares/roles.js
const NATIONAL_REGION = 'وطني';

/* Helpers simples */
function isAdmin(user) {
  return user?.role === 'admin';
}
function isModerator(user) {
  return user?.role === 'moderator';
}
function isUser(user) {
  return user?.role === 'user';
}
function isNational(user) {
  return (user?.region || '').trim() === NATIONAL_REGION;
}

/* Accès à l’espace “moderator national” */
function requireModeratorNational(req, res, next) {
  const u = req.user;
  if ((isModerator(u) && isNational(u)) || isAdmin(u)) return next();
  return res.status(403).json({ error: 'Accès refusé: espace national réservé aux modérateurs nationaux.' });
}

/* Accès à l’espace “moderator régional” */
function requireModeratorRegional(req, res, next) {
  const u = req.user;
  if (isModerator(u) && !isNational(u)) return next();
  return res.status(403).json({ error: 'Accès refusé: espace régional réservé aux modérateurs régionaux.' });
}

/* Injection automatique du filtre régional (pour les modérateurs régionaux) */
function attachRegionScope(req, _res, next) {
  const u = req.user;
  if (isModerator(u) && !isNational(u)) {
    // filtre automatique pour les requêtes DB
    req.regionScope = { region: u.region };
  } else {
    req.regionScope = {}; // pas de filtre imposé
  }
  next();
}

module.exports = {
  requireModeratorNational,
  requireModeratorRegional,
  attachRegionScope,
  isAdmin,
  isModerator,
  isUser,
  isNational,
  NATIONAL_REGION,
};
