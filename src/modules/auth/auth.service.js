const bcrypt = require('bcryptjs');
const { sequelize, User, Role, Customer, RefreshToken } = require('../../models');
const authConfig = require('../../config/auth');
const { signAccessToken, generateRefreshToken, hashToken } = require('../../utils/token');
const AppError = require('../../utils/AppError');
const AuditService = require('../audit/audit.service');

class AuthService {
  static async ensureDefaultRoles() {
    const defaults = [
      { code: 'ADMIN', name: 'Администратор' },
      { code: 'MANAGER', name: 'Менеджер каталога и заказов' },
      { code: 'CUSTOMER', name: 'Покупатель' }
    ];
    for (const r of defaults) {
      await Role.findOrCreate({ where: { code: r.code }, defaults: r });
    }
  }

  static async register(payload) {
    const { email, password, name, phone, address, role, roles, isActive, passwordHash } = payload;

    // Reject attempts to pass privileged or internal fields
    if (role !== undefined || roles !== undefined || isActive !== undefined || passwordHash !== undefined) {
      throw new AppError('Cannot specify role, isActive, or passwordHash during registration', 400);
    }

    if (!email || typeof email !== 'string') {
      throw new AppError('Valid email is required', 400);
    }
    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new AppError('Invalid email format', 400);
    }

    if (!password || typeof password !== 'string') {
      throw new AppError('Password is required', 400);
    }
    if (password.length < 8) {
      throw new AppError('Password must be at least 8 characters long', 400);
    }
    // Check bcrypt 72-byte UTF-8 limit to avoid silent truncation
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new AppError('Password exceeds maximum length of 72 bytes', 400);
    }

    await this.ensureDefaultRoles();

    const t = await sequelize.transaction();
    try {
      const existing = await User.findOne({ where: { email: normalizedEmail }, transaction: t });
      if (existing) {
        throw new AppError('User with this email already exists', 409);
      }

      const hash = await bcrypt.hash(password, authConfig.bcryptRounds);
      const user = await User.create(
        {
          email: normalizedEmail,
          passwordHash: hash,
          isActive: true
        },
        { transaction: t }
      );

      const customerRole = await Role.findOne({ where: { code: 'CUSTOMER' }, transaction: t });
      await user.addRole(customerRole, { transaction: t });

      // Link existing Customer by email or create a new Customer profile (1:1)
      let customer = await Customer.findOne({ where: { email: normalizedEmail }, transaction: t });
      if (customer) {
        if (!customer.userId) {
          customer.userId = user.id;
          await customer.save({ transaction: t });
        }
      } else {
        customer = await Customer.create(
          {
            userId: user.id,
            name: (name && String(name).trim()) || normalizedEmail.split('@')[0],
            email: normalizedEmail,
            phone: phone || null,
            address: address || null
          },
          { transaction: t }
        );
      }

      await AuditService.log(
        {
          userId: user.id,
          action: 'USER_REGISTERED',
          entityType: 'User',
          entityId: user.id,
          details: { email: user.email, assignedRole: 'CUSTOMER' }
        },
        t
      );

      await t.commit();

      return {
        id: user.id,
        email: user.email,
        isActive: user.isActive,
        roles: ['CUSTOMER'],
        customerId: customer.id,
        createdAt: user.createdAt
      };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  static async login({ email, password }) {
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      throw new AppError('Email and password are required', 400);
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new AppError('Invalid credentials', 401);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.scope('withPassword').findOne({
      where: { email: normalizedEmail },
      include: [{ model: Role, as: 'roles', through: { attributes: [] } }]
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    if (!user.isActive) {
      throw new AppError('User account is deactivated', 403);
    }

    const roleCodes = user.roles.map((r) => r.code);
    const accessToken = signAccessToken({ sub: user.id, email: user.email, roles: roleCodes });
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);

    const expiresAt = new Date(Date.now() + authConfig.refreshExpiresDays * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
      userId: user.id,
      tokenHash,
      expiresAt,
      revokedAt: null
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken
    };
  }

  static async refresh(rawRefreshToken) {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      throw new AppError('Refresh token is required', 401);
    }

    const tokenHash = hashToken(rawRefreshToken);
    const t = await sequelize.transaction();

    try {
      const storedToken = await RefreshToken.findOne({
        where: { tokenHash },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!storedToken) {
        throw new AppError('Invalid refresh token', 401);
      }

      if (storedToken.revokedAt !== null) {
        throw new AppError('Refresh token has already been revoked', 401);
      }

      if (new Date(storedToken.expiresAt) <= new Date()) {
        storedToken.revokedAt = new Date();
        await storedToken.save({ transaction: t });
        await t.commit();
        throw new AppError('Refresh token has expired', 401);
      }

      const user = await User.findByPk(storedToken.userId, {
        include: [{ model: Role, as: 'roles', through: { attributes: [] } }],
        transaction: t
      });

      if (!user || !user.isActive) {
        storedToken.revokedAt = new Date();
        await storedToken.save({ transaction: t });
        await t.commit();
        throw new AppError('User is inactive or does not exist', 403);
      }

      // Revoke old refresh token and issue a rotated pair
      storedToken.revokedAt = new Date();
      await storedToken.save({ transaction: t });

      const roleCodes = user.roles.map((r) => r.code);
      const accessToken = signAccessToken({ sub: user.id, email: user.email, roles: roleCodes });
      const newRawRefreshToken = generateRefreshToken();
      const newTokenHash = hashToken(newRawRefreshToken);
      const expiresAt = new Date(Date.now() + authConfig.refreshExpiresDays * 24 * 60 * 60 * 1000);

      await RefreshToken.create(
        {
          userId: user.id,
          tokenHash: newTokenHash,
          expiresAt,
          revokedAt: null
        },
        { transaction: t }
      );

      await t.commit();

      return {
        accessToken,
        refreshToken: newRawRefreshToken
      };
    } catch (err) {
      if (!t.finished) {
        await t.rollback();
      }
      throw err;
    }
  }

  static async logout(rawRefreshToken) {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      throw new AppError('Refresh token is required', 400);
    }

    const tokenHash = hashToken(rawRefreshToken);
    const storedToken = await RefreshToken.findOne({ where: { tokenHash } });
    if (storedToken && storedToken.revokedAt === null) {
      storedToken.revokedAt = new Date();
      await storedToken.save();
    }
  }
}

module.exports = AuthService;
