const express = require('express');
const router = express.Router();
const AuthService = require('./auth.service');
const asyncHandler = require('../../middleware/asyncHandler');
const authenticate = require('../../middleware/authenticate');
const { loginLimiter } = require('../../middleware/rateLimiter');

router.post('/register', asyncHandler(async (req, res) => {
  const user = await AuthService.register(req.body);
  res.status(201).json(user);
}));

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const tokens = await AuthService.login(req.body);
  res.status(200).json(tokens);
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const tokens = await AuthService.refresh(req.body.refreshToken);
  res.status(200).json(tokens);
}));

router.post('/logout', asyncHandler(async (req, res) => {
  await AuthService.logout(req.body.refreshToken);
  res.status(200).json({ message: 'Logged out successfully' });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.status(200).json(req.user);
}));

module.exports = router;
