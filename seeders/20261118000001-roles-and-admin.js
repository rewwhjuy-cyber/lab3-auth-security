const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert('Roles', [
      { code: 'ADMIN', name: 'Администратор', createdAt: now, updatedAt: now },
      { code: 'MANAGER', name: 'Менеджер каталога и заказов', createdAt: now, updatedAt: now },
      { code: 'CUSTOMER', name: 'Покупатель', createdAt: now, updatedAt: now }
    ], { ignoreDuplicates: true });

    const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@gamestore.local').trim().toLowerCase();
    const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!adminPassword) {
      console.warn('BOOTSTRAP_ADMIN_PASSWORD is not set; skipping bootstrap admin user creation.');
      return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await queryInterface.bulkInsert('Users', [
      { email: adminEmail, passwordHash, isActive: true, createdAt: now, updatedAt: now }
    ], { ignoreDuplicates: true });

    const [users] = await queryInterface.sequelize.query(
      `SELECT id FROM "Users" WHERE email = '${adminEmail}' LIMIT 1;`
    );
    const [roles] = await queryInterface.sequelize.query(
      `SELECT id FROM "Roles" WHERE code = 'ADMIN' LIMIT 1;`
    );
    if (users.length && roles.length) {
      await queryInterface.bulkInsert('UserRoles', [
        { userId: users[0].id, roleId: roles[0].id }
      ], { ignoreDuplicates: true });
    }
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('UserRoles', null, {});
    await queryInterface.bulkDelete('Users', null, {});
    await queryInterface.bulkDelete('Roles', null, {});
  }
};
