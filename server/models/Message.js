const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Message = sequelize.define('Message', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    senderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'sender_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    receiverId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'receiver_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM('text', 'voice', 'video', 'file', 'image'),
      defaultValue: 'text',
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('sent', 'delivered', 'read'),
      defaultValue: 'sent',
      allowNull: false
    },
    replyToId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'reply_to_id',
      references: {
        model: 'messages',
        key: 'id'
      }
    },
    forwardedFromId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'forwarded_from_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    isEdited: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_edited'
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_deleted'
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at'
    }
  }, {
    tableName: 'messages',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['sender_id', 'receiver_id']
      },
      {
        fields: ['receiver_id']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  // Associations
  Message.associate = (models) => {
    // Message belongs to sender
    Message.belongsTo(models.User, {
      as: 'sender',
      foreignKey: 'senderId'
    });

    // Message belongs to receiver
    Message.belongsTo(models.User, {
      as: 'receiver',
      foreignKey: 'receiverId'
    });

    // Message can have reply to another message
    Message.belongsTo(models.Message, {
      as: 'replyTo',
      foreignKey: 'replyToId'
    });

    // Message can have replies
    Message.hasMany(models.Message, {
      as: 'replies',
      foreignKey: 'replyToId'
    });

    // Message can be forwarded from another user
    Message.belongsTo(models.User, {
      as: 'forwardedFrom',
      foreignKey: 'forwardedFromId'
    });

    // Message can have attachments
    Message.hasMany(models.Attachment, {
      as: 'attachments',
      foreignKey: 'messageId'
    });

    // Message can have reactions
    Message.hasMany(models.Reaction, {
      as: 'reactions',
      foreignKey: 'messageId'
    });

    // Message can be pinned
    Message.hasMany(models.PinnedMessage, {
      as: 'pinnedBy',
      foreignKey: 'messageId'
    });
  };

  return Message;
};
