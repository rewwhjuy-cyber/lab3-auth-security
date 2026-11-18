const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { Category, Product } = require('../../models');
const asyncHandler = require('../../middleware/asyncHandler');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const AppError = require('../../utils/AppError');
const AuditService = require('../audit/audit.service');
const { parsePagination, parseSorting, buildPaginationMeta, escapeLike } = require('../../utils/pagination');

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const order = parseSorting(req.query, ['id', 'name', 'createdAt'], 'id', 'ASC');

  const where = {};
  if (req.query.search) {
    const s = String(req.query.search).trim();
    if (s.length > 100) throw new AppError('Search string too long', 400);
    where.name = { [Op.iLike]: `%${escapeLike(s)}%` };
  }

  const { count, rows } = await Category.findAndCountAll({
    where,
    limit,
    offset,
    order
  });

  res.status(200).json({
    data: rows,
    pagination: buildPaginationMeta(page, limit, count)
  });
}));

router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    if (!name) {
      throw new AppError('Category name is required', 400);
    }
    const category = await Category.create({ name, description });
    await AuditService.log({
      userId: req.user.id,
      action: 'CREATE_CATEGORY',
      entityType: 'Category',
      entityId: category.id,
      details: { name: category.name }
    });
    res.status(201).json(category);
  })
);

router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const category = await Category.findByPk(req.params.id);
    if (!category) {
      throw new AppError('Category not found', 404);
    }
    const productsCount = await Product.count({ where: { categoryId: category.id } });
    if (productsCount > 0) {
      throw new AppError('Cannot delete category with existing products', 409);
    }
    await category.destroy();
    await AuditService.log({
      userId: req.user.id,
      action: 'DELETE_CATEGORY',
      entityType: 'Category',
      entityId: Number(req.params.id),
      details: { name: category.name }
    });
    res.status(204).send();
  })
);

module.exports = router;
