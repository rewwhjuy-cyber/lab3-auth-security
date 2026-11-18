const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('RefreshToken', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'RefreshTokens',
    timestamps: true,
    updatedAt: false
  });
};
