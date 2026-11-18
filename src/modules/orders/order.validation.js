const AppError = require('../../utils/AppError');

const validateCreateOrder = (req, res, next) => {
  const { customerId, items, price, totalAmount, status } = req.body;

  if (price !== undefined || totalAmount !== undefined || status !== undefined) {
    return next(new AppError('Client cannot specify price, totalAmount, or status', 400));
  }

  if (customerId !== undefined && (!Number.isInteger(customerId) || customerId <= 0)) {
    return next(new AppError('If provided, customerId must be a positive integer', 400));
  }

  if (!Array.isArray(items) || items.length === 0) {
    return next(new AppError('Items must be a non-empty array', 400));
  }

  for (const item of items) {
    if (item.price !== undefined) {
      return next(new AppError('Client cannot specify item price', 400));
    }
    if (!Number.isInteger(item.productId) || item.productId <= 0) {
      return next(new AppError('Each item must have a valid positive integer productId', 400));
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return next(new AppError('Each item must have a positive integer quantity', 400));
    }
  }

  next();
};

const validateUpdateStatus = (req, res, next) => {
  const allowedKeys = ['status'];
  const keys = Object.keys(req.body);

  if (keys.length !== 1 || !allowedKeys.includes(keys[0])) {
    return next(new AppError('Only status field can be updated', 400));
  }

  const validStatuses = ['NEW', 'CONFIRMED', 'SHIPPED', 'COMPLETED', 'CANCELLED'];
  if (!validStatuses.includes(req.body.status)) {
    return next(new AppError('Invalid status value', 400));
  }

  next();
};

module.exports = {
  validateCreateOrder,
  validateUpdateStatus
};
