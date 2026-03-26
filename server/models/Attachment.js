const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Attachment = sequelize.define('Attachment', {
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
    url: {
      type: DataTypes.STRING,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('image', 'voice', 'video', 'file'),
      allowNull: false
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    originalName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'original_name'
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'mime_type'
    },
    thumbnailUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'thumbnail_url'
    }
  }, {
    tableName: 'attachments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['message_id']
      },
      {
        fields: ['type']
      }
    ]
  });

  // Associations
  Attachment.associate = (models) => {
    // Attachment belongs to a message
    Attachment.belongsTo(models.Message, {
      as: 'message',
      foreignKey: 'messageId'
    });
  };

  return Attachment;
};
