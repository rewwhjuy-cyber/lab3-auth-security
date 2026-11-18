const express = require('express');
const router = express.Router();

const authRoutes = require('../modules/auth/auth.routes');
const userRoutes = require('../modules/users/user.routes');
const auditRoutes = require('../modules/audit/audit.routes');
const categoryRoutes = require('../modules/categories/category.routes');
const productRoutes = require('../modules/products/product.routes');
const customerRoutes = require('../modules/customers/customer.routes');
const orderRoutes = require('../modules/orders/order.routes');

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/customers', customerRoutes);
router.use('/orders', orderRoutes);

module.exports = router;
