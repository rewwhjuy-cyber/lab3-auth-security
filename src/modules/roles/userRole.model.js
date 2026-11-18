const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('UserRole', {
    userId: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    roleId: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false }
  }, {
    tableName: 'UserRoles',
    timestamps: false
  });
};
