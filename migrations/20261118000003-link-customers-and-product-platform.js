module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Customers', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      unique: true,
      references: { model: 'Users', key: 'id' },
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('Products', 'platform', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'PC (Steam)'
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Products', 'platform');
    await queryInterface.removeColumn('Customers', 'userId');
  }
};
