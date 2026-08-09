const googleAuthService = require('../services/googleAuth.service');

/**
 * Middleware que inyecta el servicio de autenticación en la request.
 * La autenticación real se hace en el controller usando el email.
 */
const injectAuthService = (req, res, next) => {
  req.googleAuth = googleAuthService;
  next();
};

module.exports = { injectAuthService };