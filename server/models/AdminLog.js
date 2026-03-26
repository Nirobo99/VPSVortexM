const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AdminLog = sequelize.define('AdminLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    adminId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'admin_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    action: {
      type: DataTypes.ENUM('user_block', 'user_unblock', 'user_delete', 'role_change', 'verification_approve', 'verification_reject', 'complaint_handle', 'settings_update', 'project_block', 'project_unblock'),
      allowNull: false
    },
    targetId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'target_id'
    },
    targetType: {
      type: DataTypes.ENUM('user', 'channel', 'message', 'complaint', 'setting'),
      allowNull: true,
      field: 'target_type'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'ip_address'
    },
    realIP: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'real_ip'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    tableName: 'admin_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['admin_id']
      },
      {
        fields: ['action']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  // Associations
  AdminLog.associate = (models) => {
    // AdminLog belongs to admin user
    AdminLog.belongsTo(models.User, {
      as: 'admin',
      foreignKey: 'adminId'
    });
  };

  return AdminLog;
};
