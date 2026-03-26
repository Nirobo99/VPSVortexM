const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PinnedMessage = sequelize.define('PinnedMessage', {
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
    messageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'message_id',
      references: {
        model: 'messages',
        key: 'id'
      }
    }
  }, {
    tableName: 'pinned_messages',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'message_id']
      },
      {
        fields: ['user_id']
      }
    ]
  });

  // Associations
  PinnedMessage.associate = (models) => {
    // PinnedMessage belongs to a user
    PinnedMessage.belongsTo(models.User, {
      as: 'user',
      foreignKey: 'userId'
    });

    // PinnedMessage belongs to a message
    PinnedMessage.belongsTo(models.Message, {
      as: 'message',
      foreignKey: 'messageId'
    });
  };

  return PinnedMessage;
};
