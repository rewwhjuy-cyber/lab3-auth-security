const { Op } = require('sequelize');
const { sequelize, Product, Customer, Order, OrderItem } = require('../../models');
const AppError = require('../../utils/AppError');
const AuditService = require('../audit/audit.service');
const { parsePagination, parseSorting, buildPaginationMeta } = require('../../utils/pagination');

class OrderService {
  static isStaff(user) {
    return user.roles.includes('ADMIN') || user.roles.includes('MANAGER');
  }

  static async createOrder(payload, currentUser) {
    const { items } = payload;
    let targetCustomerId = payload.customerId;

    if (!this.isStaff(currentUser)) {
      if (payload.customerId !== undefined && payload.customerId !== currentUser.customerId) {
        throw new AppError('Customer cannot create orders for another customerId', 403);
      }
      if (!currentUser.customerId) {
        throw new AppError('Customer profile not found for current user', 400);
      }
      targetCustomerId = currentUser.customerId;
    } else if (!targetCustomerId) {
      targetCustomerId = currentUser.customerId;
    }

    if (!targetCustomerId) {
      throw new AppError('Valid customerId is required', 400);
    }

    const t = await sequelize.transaction();

    try {
      const customer = await Customer.findByPk(targetCustomerId, { transaction: t });
      if (!customer) {
        throw new AppError(`Customer with id ${targetCustomerId} not found`, 404);
      }

      const itemMap = new Map();
      for (const item of items) {
        const currentQty = itemMap.get(item.productId) || 0;
        itemMap.set(item.productId, currentQty + item.quantity);
      }

      const productIds = Array.from(itemMap.keys()).sort((a, b) => a - b);

      const products = await Product.findAll({
        where: { id: productIds },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (products.length !== productIds.length) {
        throw new AppError('One or more products not found', 404);
      }

      const productMap = new Map(products.map((p) => [p.id, p]));
      let totalCents = 0;
      const orderItemsData = [];

      for (const [productId, qty] of itemMap.entries()) {
        const product = productMap.get(productId);

        if (!product.isActive) {
          throw new AppError(`Product "${product.name}" is inactive`, 400);
        }

        if (product.quantity < qty) {
          throw new AppError(
            `Insufficient stock for "${product.name}". Available: ${product.quantity}, requested: ${qty}`,
            409
          );
        }

        const unitPrice = Number(product.price);
        totalCents += Math.round(unitPrice * 100) * qty;

        orderItemsData.push({
          productId,
          quantity: qty,
          price: product.price
        });

        product.quantity -= qty;
        await product.save({ transaction: t });
      }

      const totalAmount = (totalCents / 100).toFixed(2);

      const order = await Order.create(
        {
          customerId: targetCustomerId,
          status: 'NEW',
          totalAmount
        },
        { transaction: t }
      );

      for (const itemData of orderItemsData) {
        await OrderItem.create(
          {
            orderId: order.id,
            productId: itemData.productId,
            quantity: itemData.quantity,
            price: itemData.price
          },
          { transaction: t }
        );
      }

      await AuditService.log(
        {
          userId: currentUser.id,
          action: 'CREATE_ORDER',
          entityType: 'Order',
          entityId: order.id,
          details: { customerId: targetCustomerId, totalAmount, itemsCount: orderItemsData.length }
        },
        t
      );

      await t.commit();

      return await Order.findByPk(order.id, {
        include: [
          { model: OrderItem, as: 'items' },
          { model: Customer, as: 'customer' }
        ]
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  static async listOrders(query, currentUser) {
    const { page, limit, offset } = parsePagination(query);
    const order = parseSorting(query, ['id', 'orderDate', 'totalAmount', 'status', 'createdAt'], 'id', 'DESC');

    const where = {};

    // Apply RBAC / ownership filter BEFORE counting total
    if (!this.isStaff(currentUser)) {
      if (!currentUser.customerId) {
        return { data: [], pagination: buildPaginationMeta(page, limit, 0) };
      }
      where.customerId = currentUser.customerId;
    } else if (query.customerId !== undefined) {
      const cid = Number(query.customerId);
      if (!Number.isInteger(cid) || cid <= 0) {
        throw new AppError('customerId filter must be a positive integer', 400);
      }
      where.customerId = cid;
    }

    if (query.status) {
      const validStatuses = ['NEW', 'CONFIRMED', 'SHIPPED', 'COMPLETED', 'CANCELLED'];
      const st = String(query.status).toUpperCase();
      if (!validStatuses.includes(st)) {
        throw new AppError('Invalid status filter', 400);
      }
      where.status = st;
    }

    if (query.minTotal !== undefined || query.maxTotal !== undefined) {
      where.totalAmount = {};
      if (query.minTotal !== undefined) {
        const minT = Number(query.minTotal);
        if (Number.isNaN(minT) || minT < 0) throw new AppError('Invalid minTotal', 400);
        where.totalAmount[Op.gte] = minT;
      }
      if (query.maxTotal !== undefined) {
        const maxT = Number(query.maxTotal);
        if (Number.isNaN(maxT) || maxT < 0) throw new AppError('Invalid maxTotal', 400);
        where.totalAmount[Op.lte] = maxT;
      }
    }

    const { count, rows } = await Order.findAndCountAll({
      where,
      include: [
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] },
        { model: OrderItem, as: 'items' }
      ],
      limit,
      offset,
      order,
      distinct: true
    });

    return {
      data: rows,
      pagination: buildPaginationMeta(page, limit, count)
    };
  }

  static async getOrderById(id, currentUser) {
    const order = await Order.findByPk(id, {
      include: [
        { model: OrderItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: Customer, as: 'customer' }
      ]
    });
    if (!order) {
      throw new AppError(`Order with id ${id} not found`, 404);
    }

    // IDOR protection: CUSTOMER can only access their own orders
    if (!this.isStaff(currentUser) && order.customerId !== currentUser.customerId) {
      throw new AppError('Access to another user order is forbidden', 403);
    }

    return order;
  }

  static async updateOrderStatus(orderId, newStatus, currentUser) {
    const t = await sequelize.transaction();

    try {
      const order = await Order.findByPk(orderId, {
        include: [{ model: OrderItem, as: 'items' }],
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!order) {
        throw new AppError(`Order with id ${orderId} not found`, 404);
      }

      const staff = this.isStaff(currentUser);
      if (!staff) {
        if (order.customerId !== currentUser.customerId) {
          throw new AppError('Access to another user order is forbidden', 403);
        }
        if (newStatus !== 'CANCELLED') {
          throw new AppError('Customer can only cancel own orders', 403);
        }
        if (order.status !== 'NEW') {
          throw new AppError('Customer can only cancel orders in NEW status', 409);
        }
      }

      const currentStatus = order.status;
      const transitions = {
        NEW: ['CONFIRMED', 'CANCELLED'],
        CONFIRMED: ['SHIPPED', 'CANCELLED'],
        SHIPPED: ['COMPLETED'],
        COMPLETED: [],
        CANCELLED: []
      };

      if (!transitions[currentStatus].includes(newStatus)) {
        throw new AppError(`Invalid status transition from ${currentStatus} to ${newStatus}`, 409);
      }

      if (newStatus === 'CANCELLED') {
        const sortedItems = [...order.items].sort((a, b) => a.productId - b.productId);
        for (const item of sortedItems) {
          const product = await Product.findByPk(item.productId, {
            transaction: t,
            lock: t.LOCK.UPDATE
          });
          if (product) {
            product.quantity += item.quantity;
            await product.save({ transaction: t });
          }
        }
      }

      order.status = newStatus;
      await order.save({ transaction: t });

      await AuditService.log(
        {
          userId: currentUser.id,
          action: newStatus === 'CANCELLED' ? 'CANCEL_ORDER' : 'UPDATE_ORDER_STATUS',
          entityType: 'Order',
          entityId: order.id,
          details: { oldStatus: currentStatus, newStatus }
        },
        t
      );

      await t.commit();
      return order;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}

module.exports = OrderService;
