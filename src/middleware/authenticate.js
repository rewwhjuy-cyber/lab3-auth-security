const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/token');
const { User, Role, Customer } = require('../models');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Authentication required. Provide Bearer token.', 401));
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return next(new AppError('Access token is missing', 401));
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      return next(new AppError('Invalid or expired access token', 401));
    }

    const user = await User.findByPk(decoded.sub, {
      include: [
        { model: Role, as: 'roles', through: { attributes: [] } },
        { model: Customer, as: 'customer' }
      ]
    });

    if (!user) {
      return next(new AppError('User not found', 401));
    }

    if (!user.isActive) {
      return next(new AppError('User account is deactivated', 403));
    }

    req.user = {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      roles: user.roles.map((r) => r.code),
      customerId: user.customer ? user.customer.id : null
    };

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = authenticate;
