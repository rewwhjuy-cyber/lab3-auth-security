const AppError = require('./AppError');

const MAX_LIMIT = 100;
const MAX_OFFSET = 10000;

function parsePagination(query) {
  const rawPage = query.page !== undefined ? query.page : '1';
  const rawLimit = query.limit !== undefined ? query.limit : '10';

  if (Array.isArray(rawPage) || Array.isArray(rawLimit)) {
    throw new AppError('Duplicate pagination parameters are not allowed', 400);
  }

  if (!/^[1-9]\d*$/.test(String(rawPage))) {
    throw new AppError('Parameter "page" must be a positive integer', 400);
  }

  if (!/^[1-9]\d*$/.test(String(rawLimit))) {
    throw new AppError('Parameter "limit" must be a positive integer between 1 and 100', 400);
  }

  const page = Number(rawPage);
  const limit = Number(rawLimit);

  if (limit < 1 || limit > MAX_LIMIT) {
    throw new AppError(`Parameter "limit" must be between 1 and ${MAX_LIMIT}`, 400);
  }

  const offset = (page - 1) * limit;
  if (offset > MAX_OFFSET) {
    throw new AppError(`Maximum offset (${MAX_OFFSET}) exceeded`, 400);
  }

  return { page, limit, offset };
}

function parseSorting(query, allowedFields, defaultField = 'id', defaultDirection = 'ASC') {
  const sortField = query.sort !== undefined ? String(query.sort) : defaultField;
  const rawDir = query.direction !== undefined ? String(query.direction).toUpperCase() : defaultDirection;

  if (!allowedFields.includes(sortField)) {
    throw new AppError(`Invalid sort field. Allowed: ${allowedFields.join(', ')}`, 400);
  }

  if (!['ASC', 'DESC'].includes(rawDir)) {
    throw new AppError('Sort direction must be "asc" or "desc"', 400);
  }

  const order = [[sortField, rawDir]];
  if (sortField !== 'id') {
    order.push(['id', 'ASC']);
  }
  return order;
}

function buildPaginationMeta(page, limit, total) {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1 && total > 0
  };
}

function escapeLike(str) {
  return String(str).replace(/[\%_]/g, (ch) => `\\${ch}`);
}

module.exports = {
  parsePagination,
  parseSorting,
  buildPaginationMeta,
  escapeLike
};
