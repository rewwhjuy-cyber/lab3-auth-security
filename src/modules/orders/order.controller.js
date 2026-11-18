const OrderService = require('./order.service');
const asyncHandler = require('../../middleware/asyncHandler');

exports.createOrder = asyncHandler(async (req, res) => {
  const order = await OrderService.createOrder(req.body, req.user);
  res.status(201).json(order);
});

exports.listOrders = asyncHandler(async (req, res) => {
  const result = await OrderService.listOrders(req.query, req.user);
  res.status(200).json(result);
});

exports.getOrderById = asyncHandler(async (req, res) => {
  const order = await OrderService.getOrderById(Number(req.params.id), req.user);
  res.status(200).json(order);
});

exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await OrderService.updateOrderStatus(Number(req.params.id), req.body.status, req.user);
  res.status(200).json(order);
});
