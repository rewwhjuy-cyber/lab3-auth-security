const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { AuditLog, User } = require('../../models');
const asyncHandler = require('../../middleware/asyncHandler');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const { parsePagination, parseSorting, buildPaginationMeta } = require('../../utils/pagination');
const AppError = require('../../utils/AppError');

router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const order = parseSorting(req.query, ['id', 'createdAt', 'action', 'entityType'], 'createdAt', 'DESC');

    const where = {};
    if (req.query.userId !== undefined) {
      const uid = Number(req.query.userId);
      if (!Number.isInteger(uid) || uid <= 0) {
        throw new AppError('userId filter must be a positive integer', 400);
      }
      where.userId = uid;
    }
    if (req.query.action) {
      where.action = String(req.query.action).trim();
    }
    if (req.query.entityType) {
      where.entityType = String(req.query.entityType).trim();
    }
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) {
        const dFrom = new Date(req.query.from);
        if (Number.isNaN(dFrom.getTime())) throw new AppError('Invalid "from" date', 400);
        where.createdAt[Op.gte] = dFrom;
      }
      if (req.query.to) {
        const dTo = new Date(req.query.to);
        if (Number.isNaN(dTo.getTime())) throw new AppError('Invalid "to" date', 400);
        where.createdAt[Op.lte] = dTo;
      }
    }

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'email'] }],
      limit,
      offset,
      order,
      distinct: true
    });

    res.status(200).json({
      data: rows,
      pagination: buildPaginationMeta(page, limit, count)
    });
  })
);

module.exports = router;
