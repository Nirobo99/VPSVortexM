const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PostReaction = sequelize.define('PostReaction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    postId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'post_id',
      references: {
        model: 'posts',
        key: 'id'
      },
      onDelete: 'CASCADE',
      comment: 'Post being reacted to (null for comment reactions)'
    },
    commentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'comment_id',
      references: {
        model: 'post_comments',
        key: 'id'
      },
      onDelete: 'CASCADE',
      comment: 'Comment being reacted to (null for post reactions)'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    emoji: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Emoji reaction (👍, ❤️, 😂, etc.)'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
      comment: 'Reaction is active'
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
    tableName: 'post_reactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['post_id']
      },
      {
        fields: ['comment_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['emoji']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['created_at']
      },
      {
        unique: true,
        fields: ['post_id', 'user_id', 'emoji'],
        where: {
          commentId: null
        }
      },
      {
        unique: true,
        fields: ['comment_id', 'user_id', 'emoji'],
        where: {
          postId: null
        }
      }
    ]
  });

  // Associations
  PostReaction.associate = (models) => {
    // PostReaction belongs to Post
    PostReaction.belongsTo(models.Post, {
      as: 'post',
      foreignKey: 'postId',
      onDelete: 'CASCADE'
    });

    // PostReaction belongs to Comment
    PostReaction.belongsTo(models.PostComment, {
      as: 'comment',
      foreignKey: 'commentId',
      onDelete: 'CASCADE'
    });

    // PostReaction belongs to User
    PostReaction.belongsTo(models.User, {
      as: 'user',
      foreignKey: 'userId',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  PostReaction.prototype.toggle = async function() {
    this.isActive = !this.isActive;
    await this.save();
    
    // Update parent counts
    if (this.postId) {
      const post = await sequelize.models.Post.findByPk(this.postId);
      if (post) {
        await post.updateReactionCounts();
      }
    }
    
    if (this.commentId) {
      const comment = await sequelize.models.PostComment.findByPk(this.commentId);
      if (comment) {
        await comment.updateReactionCounts();
      }
    }
    
    return this;
  };

  // Class methods
  PostReaction.addPostReaction = async function(postId, userId, emoji) {
    const [reaction, created] = await PostReaction.findOrCreate({
      where: {
        postId,
        userId,
        emoji,
        commentId: null
      },
      defaults: {
        postId,
        userId,
        emoji,
        isActive: true
      }
    });

    if (!created && !reaction.isActive) {
      reaction.isActive = true;
      await reaction.save();
    }

    // Update post reaction counts
    const post = await sequelize.models.Post.findByPk(postId);
    if (post) {
      await post.updateReactionCounts();
    }

    return reaction;
  };

  PostReaction.addCommentReaction = async function(commentId, userId, emoji) {
    const [reaction, created] = await PostReaction.findOrCreate({
      where: {
        commentId,
        userId,
        emoji,
        postId: null
      },
      defaults: {
        commentId,
        userId,
        emoji,
        isActive: true
      }
    });

    if (!created && !reaction.isActive) {
      reaction.isActive = true;
      await reaction.save();
    }

    // Update comment reaction counts
    const comment = await sequelize.models.PostComment.findByPk(commentId);
    if (comment) {
      await comment.updateReactionCounts();
    }

    return reaction;
  };

  PostReaction.removePostReaction = async function(postId, userId, emoji) {
    const reaction = await PostReaction.findOne({
      where: {
        postId,
        userId,
        emoji,
        commentId: null
      }
    });

    if (reaction) {
      await reaction.destroy();

      // Update post reaction counts
      const post = await sequelize.models.Post.findByPk(postId);
      if (post) {
        await post.updateReactionCounts();
      }
    }

    return reaction;
  };

  PostReaction.removeCommentReaction = async function(commentId, userId, emoji) {
    const reaction = await PostReaction.findOne({
      where: {
        commentId,
        userId,
        emoji,
        postId: null
      }
    });

    if (reaction) {
      await reaction.destroy();

      // Update comment reaction counts
      const comment = await sequelize.models.PostComment.findByPk(commentId);
      if (comment) {
        await comment.updateReactionCounts();
      }
    }

    return reaction;
  };

  PostReaction.getUserPostReaction = async function(postId, userId) {
    return await PostReaction.findOne({
      where: {
        postId,
        userId,
        isActive: true,
        commentId: null
      }
    });
  };

  PostReaction.getUserCommentReaction = async function(commentId, userId) {
    return await PostReaction.findOne({
      where: {
        commentId,
        userId,
        isActive: true,
        postId: null
      }
    });
  };

  PostReaction.getUserReactions = async function(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      type = 'all' // 'posts', 'comments', 'all'
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      userId,
      isActive: true
    };

    if (type === 'posts') {
      whereClause.postId = { [sequelize.Sequelize.Op.not]: null };
      whereClause.commentId = null;
    } else if (type === 'comments') {
      whereClause.commentId = { [sequelize.Sequelize.Op.not]: null };
      whereClause.postId = null;
    }

    const { count, rows } = await PostReaction.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.Post,
          as: 'post',
          required: false,
          attributes: ['id', 'title', 'content']
        },
        {
          model: sequelize.models.PostComment,
          as: 'comment',
          required: false,
          attributes: ['id', 'content']
        },
        {
          model: sequelize.models.User,
          as: 'user',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      reactions: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalReactions: count,
        limit
      }
    };
  };

  PostReaction.getPostReactions = async function(postId, options = {}) {
    const {
      page = 1,
      limit = 20,
      emoji = null
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      postId,
      isActive: true,
      commentId: null
    };

    if (emoji) {
      whereClause.emoji = emoji;
    }

    const { count, rows } = await PostReaction.findAndCountAll({
      where: whereClause,
      include: [{
        model: sequelize.models.User,
        as: 'user',
        attributes: ['id', 'name', 'username', 'avatar']
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      reactions: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalReactions: count,
        limit
      }
    };
  };

  PostReaction.getCommentReactions = async function(commentId, options = {}) {
    const {
      page = 1,
      limit = 10,
      emoji = null
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      commentId,
      isActive: true,
      postId: null
    };

    if (emoji) {
      whereClause.emoji = emoji;
    }

    const { count, rows } = await PostReaction.findAndCountAll({
      where: whereClause,
      include: [{
        model: sequelize.models.User,
        as: 'user',
        attributes: ['id', 'name', 'username', 'avatar']
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      reactions: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalReactions: count,
        limit
      }
    };
  };

  PostReaction.getReactionStats = async function(postId = null, commentId = null) {
    const whereClause = { isActive: true };
    
    if (postId) {
      whereClause.postId = postId;
      whereClause.commentId = null;
    } else if (commentId) {
      whereClause.commentId = commentId;
      whereClause.postId = null;
    } else {
      throw new Error('Either postId or commentId must be provided');
    }

    const stats = await PostReaction.findAll({
      where: whereClause,
      attributes: [
        'emoji',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['emoji'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      raw: true
    });

    return stats.map(stat => ({
      emoji: stat.emoji,
      count: parseInt(stat.count)
    }));
  };

  // Common emojis for reactions
  PostReaction.COMMON_EMOJIS = [
    '👍', '👎', '❤️', '😂', '😮', '😢', '😡', 
    '🔥', '👏', '🎉', '🤔', '👀', '💯', '🙏', '💪'
  ];

  return PostReaction;
};
