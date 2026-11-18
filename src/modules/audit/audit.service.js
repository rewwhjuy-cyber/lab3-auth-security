const { AuditLog } = require('../../models');

class AuditService {
  static async log({ userId = null, action, entityType, entityId = null, details = null }, transaction = null) {
    return await AuditLog.create(
      {
        userId,
        action,
        entityType,
        entityId,
        details
      },
      transaction ? { transaction } : undefined
    );
  }
}

module.exports = AuditService;
