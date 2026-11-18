const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { sequelize, Product, Category, OrderItem } = require('../../models');
const asyncHandler = require('../../middleware/asyncHandler');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const AppError = require('../../utils/AppError');
const AuditService = require('../audit/audit.service');
const { parsePagination, parseSorting, buildPaginationMeta, escapeLike } = require('../../utils/pagination');

// Public catalog with pagination, search, filtering, and sorting
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const order = parseSorting(req.query, ['id', 'name', 'price', 'createdAt', 'quantity'], 'id', 'ASC');

  const where = {};

  if (req.query.search !== undefined) {
    const s = String(req.query.search).trim();
    if (s.length > 100) {
      throw new AppError('Search string cannot exceed 100 characters', 400);
    }
    if (s.length > 0) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${escapeLike(s)}%` } },
        { article: { [Op.iLike]: `%${escapeLike(s)}%` } }
      ];
    }
  }

  if (req.query.categoryId !== undefined) {
    const catId = Number(req.query.categoryId);
    if (!Number.isInteger(catId) || catId <= 0) {
      throw new AppError('categoryId must be a positive integer', 400);
    }
    where.categoryId = catId;
  }

  if (req.query.platform !== undefined) {
    const plat = String(req.query.platform).trim();
    if (plat.length > 50) throw new AppError('Invalid platform filter', 400);
    where.platform = { [Op.iLike]: `%${escapeLike(plat)}%` };
  }

  if (req.query.minPrice !== undefined || req.query.maxPrice !== undefined) {
    where.price = {};
    if (req.query.minPrice !== undefined) {
      const minP = Number(req.query.minPrice);
      if (Number.isNaN(minP) || minP < 0) throw new AppError('minPrice must be a non-negative number', 400);
      where.price[Op.gte] = minP;
    }
    if (req.query.maxPrice !== undefined) {
      const maxP = Number(req.query.maxPrice);
      if (Number.isNaN(maxP) || maxP < 0) throw new AppError('maxPrice must be a non-negative number', 400);
      where.price[Op.lte] = maxP;
    }
  }

  if (req.query.isActive !== undefined) {
    if (!['true', 'false'].includes(String(req.query.isActive))) {
      throw new AppError('isActive must be true or false', 400);
    }
    where.isActive = String(req.query.isActive) === 'true';
  }

  const { count, rows } = await Product.findAndCountAll({
    where,
    include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }],
    limit,
    offset,
    order,
    distinct: true
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
    const { name, article, platform, description, price, quantity, categoryId, isActive } = req.body;
    if (!name || !article || price === undefined || !categoryId) {
      throw new AppError('name, article, price, and categoryId are required', 400);
    }
    if (Number(price) < 0 || (quantity !== undefined && Number(quantity) < 0)) {
      throw new AppError('Price and quantity cannot be negative', 400);
    }

    const t = await sequelize.transaction();
    try {
      const product = await Product.create(
        {
          name,
          article,
          platform: platform || 'PC (Steam)',
          description,
          price,
          quantity: quantity ?? 0,
          categoryId,
          isActive: isActive ?? true
        },
        { transaction: t }
      );

      await AuditService.log(
        {
          userId: req.user.id,
          action: 'CREATE_PRODUCT',
          entityType: 'Product',
          entityId: product.id,
          details: { name: product.name, article: product.article, price: product.price, quantity: product.quantity }
        },
        t
      );

      await t.commit();
      res.status(201).json(product);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  })
);

router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const product = await Product.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!product) {
        throw new AppError('Product not found', 404);
      }
      if (req.body.price !== undefined && Number(req.body.price) < 0) {
        throw new AppError('Price cannot be negative', 400);
      }
      if (req.body.quantity !== undefined && Number(req.body.quantity) < 0) {
        throw new AppError('Quantity cannot be negative', 400);
      }

      const oldSnapshot = {
        price: product.price,
        quantity: product.quantity,
        isActive: product.isActive
      };

      const allowedUpdates = ['name', 'platform', 'description', 'price', 'quantity', 'categoryId', 'isActive'];
      const updates = {};
      for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
          updates[key] = req.body[key];
        }
      }

      await product.update(updates, { transaction: t });

      await AuditService.log(
        {
          userId: req.user.id,
          action: 'UPDATE_PRODUCT',
          entityType: 'Product',
          entityId: product.id,
          details: {
            old: oldSnapshot,
            new: { price: product.price, quantity: product.quantity, isActive: product.isActive }
          }
        },
        t
      );

      await t.commit();
      res.status(200).json(product);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  })
);

router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const product = await Product.findByPk(req.params.id, { transaction: t });
      if (!product) {
        throw new AppError('Product not found', 404);
      }
      const inOrders = await OrderItem.count({ where: { productId: product.id }, transaction: t });
      if (inOrders > 0) {
        throw new AppError('Cannot delete product referenced in orders. Use isActive=false instead.', 409);
      }

      const deletedInfo = { name: product.name, article: product.article };
      await product.destroy({ transaction: t });

      await AuditService.log(
        {
          userId: req.user.id,
          action: 'DELETE_PRODUCT',
          entityType: 'Product',
          entityId: Number(req.params.id),
          details: deletedInfo
        },
        t
      );

      await t.commit();
      res.status(204).send();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  })
);

module.exports = router;
