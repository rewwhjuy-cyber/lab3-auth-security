const AppError = require('../utils/AppError');

module.exports = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { message: err.message }
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { message: 'Request payload is too large' }
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: { message: 'Record with this unique value already exists' }
    });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(409).json({
      error: { message: 'Operation violates foreign key constraint' }
    });
  }

  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: { message: err.errors.map(e => e.message).join('; ') }
    });
  }

  console.error('Unhandled Error:', err);
  return res.status(500).json({
    error: { message: 'Internal Server Error' }
  });
};
