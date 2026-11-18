require('dotenv').config();
const { Sequelize } = require('sequelize');

const isTest = process.env.NODE_ENV === 'test';
const dbName = isTest
  ? (process.env.TEST_DB_NAME || 'universal_game_shop_test')
  : (process.env.DB_NAME || 'universal_game_shop');

const sequelize = new Sequelize(
  dbName,
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    logging: false
  }
);

module.exports = sequelize;
