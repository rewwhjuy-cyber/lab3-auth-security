const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');

function signAccessToken(payload) {
  return jwt.sign(payload, authConfig.accessSecret, {
    algorithm: authConfig.jwtAlgorithm,
    expiresIn: authConfig.accessExpiresIn
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, authConfig.accessSecret, {
    algorithms: [authConfig.jwtAlgorithm]
  });
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken
};
