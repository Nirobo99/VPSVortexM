const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PostAttachment = sequelize.define('PostAttachment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    postId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'post_id',
      references: {
        model: 'posts',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    type: {
      type: DataTypes.ENUM('image', 'video', 'audio', 'document', 'link', 'poll', 'event', 'product'),
      allowNull: false,
      comment: 'Attachment type'
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'URL for the attachment'
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Original filename'
    },
    filepath: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Server file path'
    },
    filesize: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'File size in bytes'
    },
    mimetype: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'MIME type'
    },
    thumbnail: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Thumbnail URL for images/videos'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Attachment metadata (dimensions, duration, etc.)'
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Attachment title (for links, products, etc.)'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Attachment description'
    },
    order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Display order in post'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
      comment: 'Attachment is active'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  }, {
    tableName: 'post_attachments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['post_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['order']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  // Associations
  PostAttachment.associate = (models) => {
    // PostAttachment belongs to Post
    PostAttachment.belongsTo(models.Post, {
      as: 'post',
      foreignKey: 'postId',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  PostAttachment.prototype.getDisplayInfo = function() {
    const info = {
      id: this.id,
      type: this.type,
      url: this.url,
      title: this.title,
      description: this.description,
      order: this.order
    };

    switch (this.type) {
      case 'image':
        info.thumbnail = this.thumbnail || this.url;
        info.metadata = this.metadata || {};
        break;
      
      case 'video':
        info.thumbnail = this.thumbnail;
        info.metadata = this.metadata || {};
        break;
      
      case 'audio':
        info.metadata = this.metadata || {};
        break;
      
      case 'document':
        info.filename = this.filename;
        info.filesize = this.filesize;
        info.mimetype = this.mimetype;
        break;
      
      case 'link':
        info.url = this.url;
        info.title = this.title;
        info.description = this.description;
        info.thumbnail = this.thumbnail;
        break;
      
      case 'poll':
        info.pollId = this.metadata?.pollId;
        break;
      
      case 'event':
        info.eventId = this.metadata?.eventId;
        break;
      
      case 'product':
        info.productId = this.metadata?.productId;
        break;
    }

    return info;
  };

  PostAttachment.prototype.updateOrder = async function(newOrder) {
    this.order = newOrder;
    await this.save();
  };

  PostAttachment.prototype.deactivate = async function() {
    this.isActive = false;
    await this.save();
  };

  // Class methods
  PostAttachment.createImageAttachment = async function(postId, imageData) {
    const {
      url,
      filepath,
      filename,
      filesize,
      mimetype,
      thumbnail = null,
      metadata = null,
      order = 0
    } = imageData;

    return await PostAttachment.create({
      postId,
      type: 'image',
      url,
      filepath,
      filename,
      filesize,
      mimetype,
      thumbnail,
      metadata,
      order
    });
  };

  PostAttachment.createVideoAttachment = async function(postId, videoData) {
    const {
      url,
      filepath,
      filename,
      filesize,
      mimetype,
      thumbnail = null,
      metadata = null,
      order = 0
    } = videoData;

    return await PostAttachment.create({
      postId,
      type: 'video',
      url,
      filepath,
      filename,
      filesize,
      mimetype,
      thumbnail,
      metadata,
      order
    });
  };

  PostAttachment.createDocumentAttachment = async function(postId, documentData) {
    const {
      url,
      filepath,
      filename,
      filesize,
      mimetype,
      order = 0
    } = documentData;

    return await PostAttachment.create({
      postId,
      type: 'document',
      url,
      filepath,
      filename,
      filesize,
      mimetype,
      order
    });
  };

  PostAttachment.createLinkAttachment = async function(postId, linkData) {
    const {
      url,
      title,
      description,
      thumbnail = null,
      metadata = null,
      order = 0
    } = linkData;

    return await PostAttachment.create({
      postId,
      type: 'link',
      url,
      title,
      description,
      thumbnail,
      metadata,
      order
    });
  };

  PostAttachment.createPollAttachment = async function(postId, pollId, order = 0) {
    return await PostAttachment.create({
      postId,
      type: 'poll',
      metadata: { pollId },
      order
    });
  };

  PostAttachment.createEventAttachment = async function(postId, eventId, order = 0) {
    return await PostAttachment.create({
      postId,
      type: 'event',
      metadata: { eventId },
      order
    });
  };

  PostAttachment.createProductAttachment = async function(postId, productId, order = 0) {
    return await PostAttachment.create({
      postId,
      type: 'product',
      metadata: { productId },
      order
    });
  };

  PostAttachment.getPostAttachments = async function(postId, options = {}) {
    const {
      type = null,
      isActive = true,
      sortBy = 'order',
      sortOrder = 'ASC'
    } = options;

    const whereClause = { postId, isActive };

    if (type) {
      whereClause.type = type;
    }

    return await PostAttachment.findAll({
      where: whereClause,
      order: [[sortBy, sortOrder.toUpperCase()]]
    });
  };

  PostAttachment.getAttachmentsByType = async function(postId, type) {
    return await PostAttachment.findAll({
      where: {
        postId,
        type,
        isActive: true
      },
      order: [['order', 'ASC']]
    });
  };

  PostAttachment.updateAttachmentOrder = async function(postId, attachmentOrders) {
    const transaction = await sequelize.transaction();
    
    try {
      for (const { id, order } of attachmentOrders) {
        await PostAttachment.update(
          { order },
          { 
            where: { id, postId },
            transaction
          }
        );
      }
      
      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  PostAttachment.removeAttachment = async function(attachmentId, userId) {
    const attachment = await PostAttachment.findByPk(attachmentId);
    
    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Check if user can remove attachment
    const post = await sequelize.models.Post.findByPk(attachment.postId);
    if (post) {
      const canEdit = await post.canEdit(userId);
      if (!canEdit) {
        throw new Error('You do not have permission to remove this attachment');
      }
    }

    // Soft delete attachment
    attachment.isActive = false;
    await attachment.save();

    return attachment;
  };

  PostAttachment.getAttachmentStats = async function(postId = null) {
    const whereClause = { isActive: true };
    
    if (postId) {
      whereClause.postId = postId;
    }

    const stats = await PostAttachment.findAll({
      where: whereClause,
      attributes: [
        'type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('filesize')), 'totalSize']
      ],
      group: ['type'],
      raw: true
    });

    return stats.map(stat => ({
      type: stat.type,
      count: parseInt(stat.count),
      totalSize: parseInt(stat.totalSize) || 0
    }));
  };

  // File validation helpers
  PostAttachment.VALID_IMAGE_TYPES = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
    'image/webp', 'image/svg+xml'
  ];

  PostAttachment.VALID_VIDEO_TYPES = [
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'
  ];

  PostAttachment.VALID_AUDIO_TYPES = [
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'
  ];

  PostAttachment.VALID_DOCUMENT_TYPES = [
    'application/pdf', 'text/plain', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  PostAttachment.MAX_FILE_SIZES = {
    image: 10 * 1024 * 1024, // 10MB
    video: 100 * 1024 * 1024, // 100MB
    audio: 20 * 1024 * 1024, // 20MB
    document: 10 * 1024 * 1024 // 10MB
  };

  PostAttachment.validateFileType = function(mimetype, type) {
    switch (type) {
      case 'image':
        return PostAttachment.VALID_IMAGE_TYPES.includes(mimetype);
      case 'video':
        return PostAttachment.VALID_VIDEO_TYPES.includes(mimetype);
      case 'audio':
        return PostAttachment.VALID_AUDIO_TYPES.includes(mimetype);
      case 'document':
        return PostAttachment.VALID_DOCUMENT_TYPES.includes(mimetype);
      default:
        return true;
    }
  };

  PostAttachment.validateFileSize = function(filesize, type) {
    const maxSize = PostAttachment.MAX_FILE_SIZES[type] || 10 * 1024 * 1024;
    return filesize <= maxSize;
  };

  return PostAttachment;
};
