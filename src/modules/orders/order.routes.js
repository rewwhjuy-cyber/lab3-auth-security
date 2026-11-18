const express = require('express');
const router = express.Router();
const orderController = require('./order.controller');
const { validateCreateOrder, validateUpdateStatus } = require('./order.validation');
const authenticate = require('../../middleware/authenticate');

router.post('/', authenticate, validateCreateOrder, orderController.createOrder);
router.get('/', authenticate, orderController.listOrders);
router.get('/:id', authenticate, orderController.getOrderById);
router.patch('/:id/status', authenticate, validateUpdateStatus, orderController.updateOrderStatus);

module.exports = router;
