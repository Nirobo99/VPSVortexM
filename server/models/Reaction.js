const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Reaction = sequelize.define('Reaction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    messageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'message_id',
      references: {
        model: 'messages',
        key: 'id'
      }
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
    emoji: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    tableName: 'reactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['message_id']
      },
      {
        fields: ['user_id']
      },
      {
        unique: true,
        fields: ['message_id', 'user_id', 'emoji']
      }
    ]
  });

  // Associations
  Reaction.associate = (models) => {
    // Reaction belongs to a message
    Reaction.belongsTo(models.Message, {
      as: 'message',
      foreignKey: 'messageId'
    });

    // Reaction belongs to a user
    Reaction.belongsTo(models.User, {
      as: 'user',
      foreignKey: 'userId'
    });
  };

  return Reaction;
};
