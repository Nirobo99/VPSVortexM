const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserIPLog = sequelize.define('UserIPLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent'
    },
    isProxy: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_proxy'
    },
    realIP: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'real_ip'
    },
    forwardedFor: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'forwarded_for'
    },
    action: {
      type: DataTypes.ENUM('login', 'register', 'message', 'profile_view', 'admin_action'),
      allowNull: false
    }
  }, {
    tableName: 'user_ip_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['ip_address']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['is_proxy']
      }
    ]
  });

  // Associations
  UserIPLog.associate = (models) => {
    // UserIPLog belongs to a user
    UserIPLog.belongsTo(models.User, {
      as: 'user',
      foreignKey: 'userId'
    });
  };

  return UserIPLog;
};
