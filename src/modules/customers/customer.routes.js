const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { Customer, Order } = require('../../models');
const asyncHandler = require('../../middleware/asyncHandler');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const AppError = require('../../utils/AppError');
const { parsePagination, parseSorting, buildPaginationMeta, escapeLike } = require('../../utils/pagination');

router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const order = parseSorting(req.query, ['id', 'name', 'email', 'createdAt'], 'id', 'ASC');

    const where = {};
    if (req.query.search) {
      const s = String(req.query.search).trim();
      if (s.length > 100) throw new AppError('Search query too long', 400);
      where[Op.or] = [
        { name: { [Op.iLike]: `%${escapeLike(s)}%` } },
        { email: { [Op.iLike]: `%${escapeLike(s)}%` } }
      ];
    }

    const { count, rows } = await Customer.findAndCountAll({
      where,
      limit,
      offset,
      order
    });

    res.status(200).json({
      data: rows,
      pagination: buildPaginationMeta(page, limit, count)
    });
  })
);

router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { name, email, phone, address } = req.body;
    if (!name || !email) {
      throw new AppError('Name and email are required', 400);
    }
    const customer = await Customer.create({ name, email, phone, address });
    res.status(201).json(customer);
  })
);

router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) {
      throw new AppError('Customer not found', 404);
    }
    const ordersCount = await Order.count({ where: { customerId: customer.id } });
    if (ordersCount > 0) {
      throw new AppError('Cannot delete customer with existing orders', 409);
    }
    await customer.destroy();
    res.status(204).send();
  })
);

module.exports = router;
