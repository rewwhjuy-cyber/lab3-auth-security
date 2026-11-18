const AppError = require('../utils/AppError');

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      return next(new AppError('Insufficient permissions for this operation', 403));
    }

    next();
  };
};

module.exports = authorize;
