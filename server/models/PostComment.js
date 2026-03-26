const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PostComment = sequelize.define('PostComment', {
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
    authorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'author_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 2000]
      }
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'parent_id',
      references: {
        model: 'post_comments',
        key: 'id'
      },
      onDelete: 'CASCADE',
      comment: 'For nested comments (replies)'
    },
    mentions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'User mentions in comment'
    },
    attachments: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Media attachments in comment'
    },
    isEdited: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_edited',
      comment: 'Comment has been edited'
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
    isPinned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_pinned',
      comment: 'Comment is pinned by admin'
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_deleted',
      comment: 'Comment is deleted (soft delete)'
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
      comment: 'Who deleted the comment'
    },
    reactions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      comment: 'Reaction counts by emoji'
    },
    likeCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'like_count',
      comment: 'Total like count (cached)'
    },
    replyCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'reply_count',
      comment: 'Number of replies (cached)'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
      comment: 'Comment is active (not deleted)'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional comment metadata'
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
    tableName: 'post_comments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
    indexes: [
      {
        fields: ['post_id']
      },
      {
        fields: ['author_id']
      },
      {
        fields: ['parent_id']
      },
      {
        fields: ['is_pinned']
      },
      {
        fields: ['is_deleted']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['like_count']
      }
    ]
  });

  // Associations
  PostComment.associate = (models) => {
    // PostComment belongs to Post
    PostComment.belongsTo(models.Post, {
      as: 'post',
      foreignKey: 'postId',
      onDelete: 'CASCADE'
    });

    // PostComment belongs to Author
    PostComment.belongsTo(models.User, {
      as: 'author',
      foreignKey: 'authorId'
    });

    // PostComment belongs to Parent Comment
    PostComment.belongsTo(models.PostComment, {
      as: 'parent',
      foreignKey: 'parentId',
      as: 'parent'
    });

    // PostComment has many Replies
    PostComment.hasMany(models.PostComment, {
      as: 'replies',
      foreignKey: 'parentId',
      onDelete: 'CASCADE'
    });

    // PostComment has many reactions
    PostComment.hasMany(models.PostReaction, {
      as: 'reactions',
      foreignKey: 'commentId',
      onDelete: 'CASCADE'
    });

    // PostComment belongs to deleter
    PostComment.belongsTo(models.User, {
      as: 'deleter',
      foreignKey: 'deletedBy',
      as: 'deleter'
    });
  };

  // Instance methods
  PostComment.prototype.canEdit = async function(userId) {
    if (this.authorId === userId) return true;
    
    // Check if user is channel admin
    const post = await sequelize.models.Post.findByPk(this.postId);
    if (post) {
      return await post.canEdit(userId);
    }
    
    return false;
  };

  PostComment.prototype.canDelete = async function(userId) {
    if (this.authorId === userId) return true;
    
    // Check if user is channel admin
    const post = await sequelize.models.Post.findByPk(this.postId);
    if (post) {
      return await post.canDelete(userId);
    }
    
    return false;
  };

  PostComment.prototype.edit = async function(newContent, userId) {
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

  PostComment.prototype.pin = async function() {
    this.isPinned = true;
    await this.save();
  };

  PostComment.prototype.unpin = async function() {
    this.isPinned = false;
    await this.save();
  };

  PostComment.prototype.softDelete = async function(userId) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = userId;
    this.isActive = false;
    await this.save();
  };

  PostComment.prototype.addReaction = async function(userId, emoji) {
    const { PostReaction } = sequelize.models;
    
    const [reaction, created] = await PostReaction.findOrCreate({
      where: {
        commentId: this.id,
        userId,
        emoji
      },
      defaults: {
        commentId: this.id,
        userId,
        emoji
      }
    });

    if (created) {
      await this.updateReactionCounts();
    }

    return reaction;
  };

  PostComment.prototype.removeReaction = async function(userId, emoji) {
    const { PostReaction } = sequelize.models;
    
    const reaction = await PostReaction.findOne({
      where: {
        commentId: this.id,
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

  PostComment.prototype.updateReactionCounts = async function() {
    const { PostReaction } = sequelize.models;
    
    const reactions = await PostReaction.findAll({
      where: { commentId: this.id },
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
    this.likeCount = Object.values(reactionCounts).reduce((sum, count) => sum + count, 0);
    await this.save();
  };

  PostComment.prototype.updateReplyCount = async function() {
    const count = await PostComment.count({
      where: {
        parentId: this.id,
        isActive: true,
        isDeleted: false
      }
    });
    
    this.replyCount = count;
    await this.save();
  };

  // Class methods
  PostComment.getPostComments = async function(postId, options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'ASC',
      includeReplies = false,
      parentId = null
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      postId,
      isActive: true,
      isDeleted: false
    };

    if (parentId !== null) {
      whereClause.parentId = parentId;
    } else {
      whereClause.parentId = null; // Top-level comments only
    }

    const include = [
      {
        model: sequelize.models.User,
        as: 'author',
        attributes: ['id', 'name', 'username', 'avatar']
      }
    ];

    if (includeReplies) {
      include.push({
        model: PostComment,
        as: 'replies',
        include: [{
          model: sequelize.models.User,
          as: 'author',
          attributes: ['id', 'name', 'username', 'avatar']
        }]
      });
    }

    const { count, rows } = await PostComment.findAndCountAll({
      where: whereClause,
      include,
      order: [
        ['is_pinned', 'DESC'],
        [sortBy, sortOrder.toUpperCase()]
      ],
      limit,
      offset
    });

    return {
      comments: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalComments: count,
        limit
      }
    };
  };

  PostComment.getReplies = async function(parentId, options = {}) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'ASC'
    } = options;

    const offset = (page - 1) * limit;

    const { count, rows } = await PostComment.findAndCountAll({
      where: {
        parentId,
        isActive: true,
        isDeleted: false
      },
      include: [{
        model: sequelize.models.User,
        as: 'author',
        attributes: ['id', 'name', 'username', 'avatar']
      }],
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit,
      offset
    });

    return {
      replies: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalReplies: count,
        limit
      }
    };
  };

  PostComment.getUserComments = async function(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      channelId = null
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      authorId: userId,
      isActive: true,
      isDeleted: false
    };

    if (channelId) {
      // Include posts from specific channel
      const postIds = await sequelize.models.Post.findAll({
        where: { channelId },
        attributes: ['id']
      }).then(posts => posts.map(p => p.id));

      whereClause.postId = { [sequelize.Sequelize.Op.in]: postIds };
    }

    const { count, rows } = await PostComment.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.Post,
          as: 'post',
          attributes: ['id', 'title', 'channelId']
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
      comments: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalComments: count,
        limit
      }
    };
  };

  // Hooks
  PostComment.afterCreate(async (comment) => {
    // Update post comment count
    const post = await sequelize.models.Post.findByPk(comment.postId);
    if (post) {
      post.comments += 1;
      await post.save();
    }

    // Update parent comment reply count
    if (comment.parentId) {
      const parentComment = await PostComment.findByPk(comment.parentId);
      if (parentComment) {
        await parentComment.updateReplyCount();
      }
    }
  });

  PostComment.afterDestroy(async (comment) => {
    // Update post comment count
    const post = await sequelize.models.Post.findByPk(comment.postId);
    if (post) {
      post.comments = Math.max(0, post.comments - 1);
      await post.save();
    }

    // Update parent comment reply count
    if (comment.parentId) {
      const parentComment = await PostComment.findByPk(comment.parentId);
      if (parentComment) {
        await parentComment.updateReplyCount();
      }
    }
  });

  return PostComment;
};
