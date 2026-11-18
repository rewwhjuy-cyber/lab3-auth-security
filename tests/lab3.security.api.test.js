const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const authConfig = require('../src/config/auth');
const AuthService = require('../src/modules/auth/auth.service');
const { sequelize, Category, Product, Customer, User, Role, AuditLog } = require('../src/models');

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Lab 3: Auth, RBAC, IDOR, Pagination, AuditLog & RateLimit', () => {
  let category;
  let game1;
  let game2;
  let adminTokens;
  let customer1Tokens;
  let customer2Tokens;

  beforeEach(async () => {
    await sequelize.sync({ force: true });
    await AuthService.ensureDefaultRoles();

    category = await Category.create({ name: 'RPG', description: 'Role Playing Games' });
    game1 = await Product.create({
      name: 'Cyberpunk 2077',
      article: 'CP-2077',
      platform: 'PC (Steam)',
      price: 2499.00,
      quantity: 5,
      categoryId: category.id,
      isActive: true
    });
    game2 = await Product.create({
      name: 'The Witcher 3',
      article: 'TW3-GOTY',
      platform: 'PC (GOG)',
      price: 1199.00,
      quantity: 10,
      categoryId: category.id,
      isActive: true
    });

    // Register Customer 1 & Customer 2
    await request(app).post('/api/auth/register').send({
      email: 'cust1@example.com',
      password: 'Password123!',
      name: 'Покупатель Первый'
    });
    await request(app).post('/api/auth/register').send({
      email: 'cust2@example.com',
      password: 'Password123!',
      name: 'Покупатель Второй'
    });

    // Create Admin user
    const adminReg = await request(app).post('/api/auth/register').send({
      email: 'admin@example.com',
      password: 'AdminPassword123!',
      name: 'Администратор'
    });
    const adminUser = await User.findByPk(adminReg.body.id);
    const adminRole = await Role.findOne({ where: { code: 'ADMIN' } });
    await adminUser.setRoles([adminRole]);

    const loginAdmin = await request(app).post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'AdminPassword123!'
    });
    adminTokens = loginAdmin.body;

    const loginCust1 = await request(app).post('/api/auth/login').send({
      email: 'cust1@example.com',
      password: 'Password123!'
    });
    customer1Tokens = loginCust1.body;

    const loginCust2 = await request(app).post('/api/auth/login').send({
      email: 'cust2@example.com',
      password: 'Password123!'
    });
    customer2Tokens = loginCust2.body;
  });

  test('1-4. Registration validation, duplicate email 409, and privilege escalation block', async () => {
    const dup = await request(app).post('/api/auth/register').send({
      email: 'cust1@example.com',
      password: 'Password123!'
    });
    expect(dup.status).toBe(409);

    const weak = await request(app).post('/api/auth/register').send({
      email: 'weak@example.com',
      password: '123'
    });
    expect(weak.status).toBe(400);

    const priv = await request(app).post('/api/auth/register').send({
      email: 'hacker@example.com',
      password: 'Password123!',
      role: 'ADMIN'
    });
    expect(priv.status).toBe(400);
  });

  test('5-9. Login, invalid password 401, missing/invalid/expired JWT 401', async () => {
    const badLogin = await request(app).post('/api/auth/login').send({
      email: 'cust1@example.com',
      password: 'WrongPassword'
    });
    expect(badLogin.status).toBe(401);

    const noToken = await request(app).get('/api/auth/me');
    expect(noToken.status).toBe(401);

    const badToken = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(badToken.status).toBe(401);

    const expiredToken = jwt.sign(
      { sub: 1, email: 'cust1@example.com', roles: ['CUSTOMER'] },
      authConfig.accessSecret,
      { expiresIn: -10 }
    );
    const expRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(expRes.status).toBe(401);
  });

  test('10-11. RBAC 403 and IDOR protection on orders', async () => {
    // Customer cannot create a product
    const forbiddenProd = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${customer1Tokens.accessToken}`)
      .send({ name: 'Hack Game', article: 'HK-1', price: 100, categoryId: category.id });
    expect(forbiddenProd.status).toBe(403);

    // Customer 1 creates an order
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer1Tokens.accessToken}`)
      .send({ items: [{ productId: game1.id, quantity: 1 }] });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.id;

    // Customer 2 tries to view Customer 1 order (IDOR) -> 403
    const idorGet = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${customer2Tokens.accessToken}`);
    expect(idorGet.status).toBe(403);
  });

  test('12-15. Refresh token rotation, replay rejection 401, logout revocation, deactivated user 403', async () => {
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: customer1Tokens.refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();

    // Replay old refresh token -> 401
    const replayRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: customer1Tokens.refreshToken });
    expect(replayRes.status).toBe(401);

    // Logout new refresh token and try to refresh again -> 401
    await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: refreshRes.body.refreshToken });
    const afterLogout = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refreshRes.body.refreshToken });
    expect(afterLogout.status).toBe(401);

    // Admin deactivates Customer 2 -> Customer 2 access blocked (403)
    const cust2User = await User.findOne({ where: { email: 'cust2@example.com' } });
    const deact = await request(app)
      .patch(`/api/users/${cust2User.id}/status`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({ isActive: false });
    expect(deact.status).toBe(200);

    const blockedMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${customer2Tokens.accessToken}`);
    expect(blockedMe.status).toBe(403);
  });

  test('16-22. Pagination, search, filtering, sorting, and validation errors', async () => {
    const page1 = await request(app).get('/api/products?page=1&limit=1&sort=price&direction=asc');
    expect(page1.status).toBe(200);
    expect(page1.body.data.length).toBe(1);
    expect(page1.body.data[0].name).toBe('The Witcher 3');
    expect(page1.body.pagination.total).toBe(2);
    expect(page1.body.pagination.hasNext).toBe(true);

    const search = await request(app).get('/api/products?search=Cyberpunk&minPrice=2000');
    expect(search.status).toBe(200);
    expect(search.body.data.length).toBe(1);

    const negPage = await request(app).get('/api/products?page=-1');
    expect(negPage.status).toBe(400);

    const overLimit = await request(app).get('/api/products?limit=500');
    expect(overLimit.status).toBe(400);

    const badSort = await request(app).get('/api/products?sort=passwordHash');
    expect(badSort.status).toBe(400);
  });

  test('23-24. Transactional AuditLog and Login Rate Limit 429', async () => {
    await request(app)
      .patch(`/api/products/${game1.id}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({ price: 1999.00 });

    const logsRes = await request(app)
      .get('/api/audit-logs?action=UPDATE_PRODUCT')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.data.length).toBe(1);
    expect(logsRes.body.data[0].details.new.price).toBe('1999.00');

    // Trigger login rate limit (max 5 attempts)
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({
        email: 'ratelimit@example.com',
        password: 'WrongPassword!'
      });
    }
    const limited = await request(app).post('/api/auth/login').send({
      email: 'ratelimit@example.com',
      password: 'WrongPassword!'
    });
    expect(limited.status).toBe(429);
  });
});
