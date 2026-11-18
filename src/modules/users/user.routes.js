const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { sequelize, User, Role, Customer, RefreshToken } = require('../../models');
const asyncHandler = require('../../middleware/asyncHandler');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const AppError = require('../../utils/AppError');
const AuditService = require('../audit/audit.service');
const { parsePagination, parseSorting, buildPaginationMeta, escapeLike } = require('../../utils/pagination');

// Admin: list users with pagination and search
router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const order = parseSorting(req.query, ['id', 'email', 'createdAt', 'isActive'], 'id', 'ASC');

    const where = {};
    if (req.query.search) {
      const s = String(req.query.search).trim();
      if (s.length > 100) throw new AppError('Search query is too long', 400);
      where.email = { [Op.iLike]: `%${escapeLike(s)}%` };
    }
    if (req.query.isActive !== undefined) {
      if (!['true', 'false'].includes(String(req.query.isActive))) {
        throw new AppError('isActive must be true or false', 400);
      }
      where.isActive = String(req.query.isActive) === 'true';
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      include: [
        { model: Role, as: 'roles', through: { attributes: [] } },
        { model: Customer, as: 'customer', attributes: ['id', 'name'] }
      ],
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

// Admin: assign roles to user
router.put(
  '/:id/roles',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const targetUserId = Number(req.params.id);
    const { roles } = req.body;

    if (!Array.isArray(roles) || roles.length === 0) {
      throw new AppError('roles must be a non-empty array of role codes', 400);
    }

    const t = await sequelize.transaction();
    try {
      const user = await User.findByPk(targetUserId, {
        include: [{ model: Role, as: 'roles' }],
        transaction: t
      });
      if (!user) {
        throw new AppError('User not found', 404);
      }

      const foundRoles = await Role.findAll({
        where: { code: roles },
        transaction: t
      });
      if (foundRoles.length !== new Set(roles).size) {
        throw new AppError('One or more specified roles do not exist', 400);
      }

      const oldRoles = user.roles.map((r) => r.code);
      await user.setRoles(foundRoles, { transaction: t });

      await AuditService.log(
        {
          userId: req.user.id,
          action: 'ASSIGN_ROLES',
          entityType: 'User',
          entityId: user.id,
          details: { oldRoles, newRoles: foundRoles.map((r) => r.code) }
        },
        t
      );

      await t.commit();
      res.status(200).json({
        id: user.id,
        email: user.email,
        roles: foundRoles.map((r) => r.code)
      });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  })
);

// Admin: activate/deactivate user account
router.patch(
  '/:id/status',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const targetUserId = Number(req.params.id);
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      throw new AppError('isActive must be a boolean', 400);
    }

    if (targetUserId === req.user.id && isActive === false) {
      throw new AppError('Administrator cannot deactivate own account', 400);
    }

    const t = await sequelize.transaction();
    try {
      const user = await User.findByPk(targetUserId, { transaction: t });
      if (!user) {
        throw new AppError('User not found', 404);
      }

      user.isActive = isActive;
      await user.save({ transaction: t });

      if (!isActive) {
        await RefreshToken.update(
          { revokedAt: new Date() },
          { where: { userId: user.id, revokedAt: null }, transaction: t }
        );
      }

      await AuditService.log(
        {
          userId: req.user.id,
          action: isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
          entityType: 'User',
          entityId: user.id,
          details: { email: user.email, isActive }
        },
        t
      );

      await t.commit();
      res.status(200).json({
        id: user.id,
        email: user.email,
        isActive: user.isActive
      });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  })
);

module.exports = router;
