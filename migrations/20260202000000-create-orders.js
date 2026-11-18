module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Orders', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      customerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Customers', key: 'id' },
        onDelete: 'RESTRICT'
      },
      orderDate: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'NEW' },
      totalAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0.00 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('Orders');
  }
};
