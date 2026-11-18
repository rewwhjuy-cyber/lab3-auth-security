require('dotenv').config();

module.exports = {
  accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_key_for_lab3_testing_only',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_key_for_lab3_testing_only',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  refreshExpiresDays: Number(process.env.JWT_REFRESH_EXPIRES_DAYS) || 7,
  jwtAlgorithm: 'HS256',
  bcryptRounds: 10
};
