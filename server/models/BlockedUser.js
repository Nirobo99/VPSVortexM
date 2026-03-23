const { DataTypes, Sequelize } = require('sequelize');

module.exports = (sequelize) => {
  const BlockedUser = sequelize.define('BlockedUser', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id'
  },
  blockedUserId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'blocked_user_id'
  }
}, {
  tableName: 'blocked_users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false // Только дата создания
});

return BlockedUser;
};
