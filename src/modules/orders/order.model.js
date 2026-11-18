const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('Order', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    customerId: { type: DataTypes.INTEGER, allowNull: false },
    orderDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'NEW',
      validate: {
        isIn: [['NEW', 'CONFIRMED', 'SHIPPED', 'COMPLETED', 'CANCELLED']]
      }
    },
    totalAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    }
  }, {
    tableName: 'Orders',
    timestamps: true
  });
};
