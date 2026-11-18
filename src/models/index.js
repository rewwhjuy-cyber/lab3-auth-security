const sequelize = require('../config/database');
const defineCategory = require('../modules/categories/category.model');
const defineProduct = require('../modules/products/product.model');
const defineCustomer = require('../modules/customers/customer.model');
const defineOrder = require('../modules/orders/order.model');
const defineOrderItem = require('../modules/orders/orderItem.model');
const defineUser = require('../modules/users/user.model');
const defineRole = require('../modules/roles/role.model');
const defineUserRole = require('../modules/roles/userRole.model');
const defineRefreshToken = require('../modules/auth/refreshToken.model');
const defineAuditLog = require('../modules/audit/auditLog.model');

const Category = defineCategory(sequelize);
const Product = defineProduct(sequelize);
const Customer = defineCustomer(sequelize);
const Order = defineOrder(sequelize);
const OrderItem = defineOrderItem(sequelize);
const User = defineUser(sequelize);
const Role = defineRole(sequelize);
const UserRole = defineUserRole(sequelize);
const RefreshToken = defineRefreshToken(sequelize);
const AuditLog = defineAuditLog(sequelize);

// Domain associations (Lab 2)
Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products', onDelete: 'RESTRICT' });
Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

Customer.hasMany(Order, { foreignKey: 'customerId', as: 'orders', onDelete: 'RESTRICT' });
Order.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items', onDelete: 'CASCADE' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

Product.hasMany(OrderItem, { foreignKey: 'productId', as: 'orderItems', onDelete: 'RESTRICT' });
OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// Auth, RBAC, Audit & 1:0..1 Customer link (Lab 3)
User.belongsToMany(Role, { through: UserRole, foreignKey: 'userId', otherKey: 'roleId', as: 'roles' });
Role.belongsToMany(User, { through: UserRole, foreignKey: 'roleId', otherKey: 'userId', as: 'users' });

User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens', onDelete: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs', onDelete: 'SET NULL' });
AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasOne(Customer, { foreignKey: 'userId', as: 'customer', onDelete: 'SET NULL' });
Customer.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
  sequelize,
  Category,
  Product,
  Customer,
  Order,
  OrderItem,
  User,
  Role,
  UserRole,
  RefreshToken,
  AuditLog
};
