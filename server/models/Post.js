const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Post = sequelize.define('Post', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    channelId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'channel_id',
      references: {
        model: 'channels',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    authorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'author_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    type: {
      type: DataTypes.ENUM('text', 'media', 'poll', 'event', 'product', 'article'),
      defaultValue: 'text',
      allowNull: false,
      comment: 'Post type'
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Post title (for articles, events, etc.)'
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Post content/text'
    },
    attachments: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Media attachments (images, videos, documents)'
    },
    mentions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'User mentions in post'
    },
    hashtags: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Hashtags in post'
    },
    isPinned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_pinned',
      comment: 'Post is pinned in channel'
    },
    isScheduled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_scheduled',
      comment: 'Post is scheduled for future publishing'
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'scheduled_at',
      comment: 'Scheduled publish time'
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_published',
      comment: 'Post is published (visible to others)'
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'published_at',
      comment: 'Actual publish time'
    },
    isDraft: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_draft',
      comment: 'Post is draft (not published)'
    },
    allowComments: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'allow_comments',
      comment: 'Allow comments on this post'
    },
    allowReactions: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'allow_reactions',
      comment: 'Allow reactions on this post'
    },
    isEdited: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_edited',
      comment: 'Post has been edited'
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'edited_at',
      comment: 'Last edit time'
    },
    editHistory: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Edit history (content, timestamp)'
    },
    views: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Post view count'
    },
    likes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Post like count (cached)'
    },
    comments: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Post comment count (cached)'
    },
    shares: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Post share count'
    },
    reactions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      comment: 'Reaction counts by emoji'
    },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
      defaultValue: 'normal',
      comment: 'Post priority for notifications'
    },
    location: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Location data (lat, lng, address)'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional post metadata'
    },
    seo: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'SEO metadata (title, description, keywords)'
    },
    settings: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Post-specific settings'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
      comment: 'Post is active (not deleted)'
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
      comment: 'Soft delete timestamp'
    },
    deletedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'deleted_by',
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Who deleted the post'
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
    tableName: 'posts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true, // Enable soft deletes
    deletedAt: 'deleted_at',
    indexes: [
      {
        fields: ['channel_id']
      },
      {
        fields: ['author_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['is_published']
      },
      {
        fields: ['is_pinned']
      },
      {
        fields: ['is_draft']
      },
      {
        fields: ['is_scheduled']
      },
      {
        fields: ['scheduled_at']
      },
      {
        fields: ['published_at']
      },
      {
        fields: ['priority']
      },
      {
        fields: ['views']
      },
      {
        fields: ['likes']
      },
      {
        fields: ['created_at']
      },
      {
        type: 'FULLTEXT',
        fields: ['title', 'content']
      }
    ]
  });

  // Associations
  Post.associate = (models) => {
    // Post belongs to Channel
    Post.belongsTo(models.Channel, {
      as: 'channel',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });

    // Post belongs to Author
    Post.belongsTo(models.User, {
      as: 'author',
      foreignKey: 'authorId'
    });

    // Post belongs to deleter
    Post.belongsTo(models.User, {
      as: 'deleter',
      foreignKey: 'deletedBy',
      as: 'deleter'
    });

    // Post has many comments
    Post.hasMany(models.PostComment, {
      as: 'comments',
      foreignKey: 'postId',
      onDelete: 'CASCADE'
    });

    // Post has many reactions
    Post.hasMany(models.PostReaction, {
      as: 'reactions',
      foreignKey: 'postId',
      onDelete: 'CASCADE'
    });

    // Post has many attachments
    Post.hasMany(models.PostAttachment, {
      as: 'attachments',
      foreignKey: 'postId',
      onDelete: 'CASCADE'
    });

    // Post has many shares
    Post.hasMany(models.PostShare, {
      as: 'shares',
      foreignKey: 'postId',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  Post.prototype.isPublished = function() {
    return this.isPublished && !this.isDraft && !this.deletedAt;
  };

  Post.prototype.canEdit = async function(userId) {
    if (this.authorId === userId) return true;
    
    // Check if user is channel admin
    const member = await sequelize.models.ChannelMember.findOne({
      where: {
        channelId: this.channelId,
        userId,
        role: ['admin', 'owner'],
        isActive: true
      }
    });
    
    return !!member;
  };

  Post.prototype.canDelete = async function(userId) {
    if (this.authorId === userId) return true;
    
    // Check if user is channel admin
    const member = await sequelize.models.ChannelMember.findOne({
      where: {
        channelId: this.channelId,
        userId,
        role: ['admin', 'owner'],
        isActive: true
      }
    });
    
    return !!member;
  };

  Post.prototype.canComment = async function(userId) {
    if (!this.allowComments) return false;
    
    // Check if user is channel member
    const member = await sequelize.models.ChannelMember.findOne({
      where: {
        channelId: this.channelId,
        userId,
        isActive: true,
        isBanned: false
      }
    });
    
    return !!member && member.canComment;
  };

  Post.prototype.incrementViews = async function() {
    this.views += 1;
    await this.save();
  };

  Post.prototype.addReaction = async function(userId, emoji) {
    const { PostReaction } = sequelize.models;
    
    const [reaction, created] = await PostReaction.findOrCreate({
      where: {
        postId: this.id,
        userId,
        emoji
      },
      defaults: {
        postId: this.id,
        userId,
        emoji
      }
    });

    if (created) {
      await this.updateReactionCounts();
    }

    return reaction;
  };

  Post.prototype.removeReaction = async function(userId, emoji) {
    const { PostReaction } = sequelize.models;
    
    const reaction = await PostReaction.findOne({
      where: {
        postId: this.id,
        userId,
        emoji
      }
    });

    if (reaction) {
      await reaction.destroy();
      await this.updateReactionCounts();
    }

    return reaction;
  };

  Post.prototype.updateReactionCounts = async function() {
    const { PostReaction } = sequelize.models;
    
    const reactions = await PostReaction.findAll({
      where: { postId: this.id },
      attributes: [
        'emoji',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['emoji'],
      raw: true
    });

    const reactionCounts = {};
    reactions.forEach(r => {
      reactionCounts[r.emoji] = parseInt(r.count);
    });

    this.reactions = reactionCounts;
    this.likes = Object.values(reactionCounts).reduce((sum, count) => sum + count, 0);
    await this.save();
  };

  Post.prototype.publish = async function() {
    this.isPublished = true;
    this.isDraft = false;
    this.publishedAt = new Date();
    await this.save();

    // Update channel stats
    const channel = await sequelize.models.Channel.findByPk(this.channelId);
    if (channel) {
      await channel.updatePostCount();
      await channel.updateLastActivity();
    }
  };

  Post.prototype.schedule = async function(scheduledTime) {
    this.isScheduled = true;
    this.isDraft = true;
    this.isPublished = false;
    this.scheduledAt = scheduledTime;
    await this.save();
  };

  Post.prototype.unschedule = async function() {
    this.isScheduled = false;
    this.scheduledAt = null;
    await this.save();
  };

  Post.prototype.pin = async function() {
    this.isPinned = true;
    await this.save();
  };

  Post.prototype.unpin = async function() {
    this.isPinned = false;
    await this.save();
  };

  Post.prototype.edit = async function(newContent, userId) {
    const editRecord = {
      content: this.content,
      editedAt: new Date(),
      editedBy: userId
    };

    this.editHistory = [...(this.editHistory || []), editRecord];
    this.content = newContent;
    this.isEdited = true;
    this.editedAt = new Date();
    await this.save();
  };

  Post.prototype.softDelete = async function(userId) {
    this.isActive = false;
    this.deletedAt = new Date();
    this.deletedBy = userId;
    await this.save();

    // Update channel stats
    const channel = await sequelize.models.Channel.findByPk(this.channelId);
    if (channel) {
      await channel.updatePostCount();
    }
  };

  // Class methods
  Post.findChannelPosts = async function(channelId, options = {}) {
    const {
      page = 1,
      limit = 20,
      type = null,
      authorId = null,
      isPinned = null,
      sortBy = 'published_at',
      sortOrder = 'DESC',
      includeComments = false,
      includeReactions = false
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      channelId,
      isPublished: true,
      isDraft: false,
      deletedAt: null
    };

    if (type) {
      whereClause.type = type;
    }

    if (authorId) {
      whereClause.authorId = authorId;
    }

    if (isPinned !== null) {
      whereClause.isPinned = isPinned;
    }

    const include = [
      {
        model: sequelize.models.User,
        as: 'author',
        attributes: ['id', 'name', 'username', 'avatar']
      }
    ];

    if (includeComments) {
      include.push({
        model: sequelize.models.PostComment,
        as: 'comments',
        include: [{
          model: sequelize.models.User,
          as: 'author',
          attributes: ['id', 'name', 'username', 'avatar']
        }]
      });
    }

    if (includeReactions) {
      include.push({
        model: sequelize.models.PostReaction,
        as: 'reactions',
        include: [{
          model: sequelize.models.User,
          as: 'user',
          attributes: ['id', 'name', 'username', 'avatar']
        }]
      });
    }

    const order = [
      ['is_pinned', 'DESC'],
      [sortBy, sortOrder.toUpperCase()]
    ];

    const { count, rows } = await Post.findAndCountAll({
      where: whereClause,
      include,
      order,
      limit,
      offset
    });

    return {
      posts: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalPosts: count,
        limit
      }
    };
  };

  Post.findScheduledPosts = async function() {
    return await Post.findAll({
      where: {
        isScheduled: true,
        isDraft: true,
        scheduledAt: {
          [sequelize.Sequelize.Op.lte]: new Date()
        }
      },
      include: [
        {
          model: sequelize.models.Channel,
          as: 'channel',
          attributes: ['id', 'name', 'type']
        }
      ]
    });
  };

  Post.findUserPosts = async function(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      channelId = null,
      type = null
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      authorId: userId,
      deletedAt: null
    };

    if (channelId) {
      whereClause.channelId = channelId;
    }

    if (type) {
      whereClause.type = type;
    }

    const { count, rows } = await Post.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.Channel,
          as: 'channel',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      posts: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalPosts: count,
        limit
      }
    };
  };

  Post.searchPosts = async function(query, options = {}) {
    const {
      page = 1,
      limit = 20,
      channelId = null,
      type = null
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      [sequelize.Sequelize.Op.or]: [
        { title: { [sequelize.Sequelize.Op.like]: `%${query}%` } },
        { content: { [sequelize.Sequelize.Op.like]: `%${query}%` } }
      ],
      isPublished: true,
      isDraft: false,
      deletedAt: null
    };

    if (channelId) {
      whereClause.channelId = channelId;
    }

    if (type) {
      whereClause.type = type;
    }

    const { count, rows } = await Post.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.Channel,
          as: 'channel',
          attributes: ['id', 'name', 'username', 'avatar']
        },
        {
          model: sequelize.models.User,
          as: 'author',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      posts: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalPosts: count,
        limit
      }
    };
  };

  // Hooks
  Post.afterCreate(async (post) => {
    // Update channel post count
    const channel = await sequelize.models.Channel.findByPk(post.channelId);
    if (channel && post.isPublished && !post.isDraft) {
      await channel.updatePostCount();
      await channel.updateLastActivity();
    }
  });

  Post.afterDestroy(async (post) => {
    // Update channel post count
    const channel = await sequelize.models.Channel.findByPk(post.channelId);
    if (channel) {
      await channel.updatePostCount();
    }
  });

  return Post;
};
