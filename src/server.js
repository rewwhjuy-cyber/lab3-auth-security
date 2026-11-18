require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');
const AuthService = require('./modules/auth/auth.service');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    await AuthService.ensureDefaultRoles();
    app.listen(PORT, () => {
      console.log(`Game Store Backend (Lab 3) running on http://localhost:${PORT}`);
      console.log(`Swagger UI available at http://localhost:${PORT}/api/docs`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
