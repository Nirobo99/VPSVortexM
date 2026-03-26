const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Poll = sequelize.define('Poll', {
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
    postId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'post_id',
      references: {
        model: 'posts',
        key: 'id'
      },
      comment: 'Associated post for this poll'
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
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional poll description'
    },
    type: {
      type: DataTypes.ENUM('single', 'multiple', 'ranking', 'quiz'),
      defaultValue: 'single',
      comment: 'Poll type: single choice, multiple choice, ranking, or quiz'
    },
    options: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: 'Poll options with text, image, and metadata'
    },
    settings: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        allowMultipleVotes: false,
        showResults: true,
        allowChangeVote: true,
        anonymousVoting: false,
        deadline: null,
        maxVotes: null
      },
      comment: 'Poll settings and rules'
    },
    votes: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      comment: 'Vote counts by option index'
    },
    totalVotes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_votes',
      comment: 'Total number of votes cast'
    },
    uniqueVoters: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'unique_voters',
      comment: 'Number of unique voters'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
      comment: 'Poll is active and accepting votes'
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_published',
      comment: 'Poll is published and visible'
    },
    isClosed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_closed',
      comment: 'Poll voting is closed'
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'closed_at',
      comment: 'When poll was closed'
    },
    deadline: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Voting deadline'
    },
    results: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Final poll results and analysis'
    },
    winner: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Winning option(s) for quiz polls'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional poll metadata'
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
    tableName: 'polls',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['channel_id']
      },
      {
        fields: ['post_id']
      },
      {
        fields: ['author_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['is_published']
      },
      {
        fields: ['is_closed']
      },
      {
        fields: ['deadline']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  // Associations
  Poll.associate = (models) => {
    // Poll belongs to Channel
    Poll.belongsTo(models.Channel, {
      as: 'channel',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });

    // Poll belongs to Post
    Poll.belongsTo(models.Post, {
      as: 'post',
      foreignKey: 'postId'
    });

    // Poll belongs to Author
    Poll.belongsTo(models.User, {
      as: 'author',
      foreignKey: 'authorId'
    });

    // Poll has many votes
    Poll.hasMany(models.PollVote, {
      as: 'votes',
      foreignKey: 'pollId',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  Poll.prototype.isOpen = function() {
    if (!this.isActive || this.isClosed) return false;
    if (this.deadline && new Date() > this.deadline) return false;
    return true;
  };

  Poll.prototype.canVote = async function(userId) {
    if (!this.isOpen()) return false;
    
    // Check if user is channel member
    const member = await sequelize.models.ChannelMember.findOne({
      where: {
        channelId: this.channelId,
        userId,
        isActive: true,
        isBanned: false
      }
    });
    
    return !!member;
  };

  Poll.prototype.hasVoted = async function(userId) {
    const vote = await sequelize.models.PollVote.findOne({
      where: {
        pollId: this.id,
        userId
      }
    });
    
    return !!vote;
  };

  Poll.prototype.getUserVote = async function(userId) {
    return await sequelize.models.PollVote.findOne({
      where: {
        pollId: this.id,
        userId
      }
    });
  };

  Poll.prototype.castVote = async function(userId, optionIndices) {
    if (!this.isOpen()) {
      throw new Error('Poll is not open for voting');
    }

    const canVote = await this.canVote(userId);
    if (!canVote) {
      throw new Error('User cannot vote in this poll');
    }

    // Handle vote change setting
    const existingVote = await this.hasVoted(userId);
    if (existingVote && !this.settings.allowChangeVote) {
      throw new Error('Vote change is not allowed');
    }

    // Validate options
    if (!Array.isArray(optionIndices) || optionIndices.length === 0) {
      throw new Error('Invalid vote options');
    }

    if (this.type === 'single' && optionIndices.length > 1) {
      throw new Error('Single choice poll allows only one option');
    }

    if (this.type === 'multiple' && optionIndices.length > (this.settings.maxOptions || 5)) {
      throw new Error('Too many options selected');
    }

    // Remove existing vote if changing vote
    if (existingVote) {
      await sequelize.models.PollVote.destroy({
        where: {
          pollId: this.id,
          userId
        }
      });
    }

    // Create new vote
    const vote = await sequelize.models.PollVote.create({
      pollId: this.id,
      userId,
      optionIndices,
      votedAt: new Date()
    });

    // Update vote counts
    await this.updateVoteCounts();

    return vote;
  };

  Poll.prototype.updateVoteCounts = async function() {
    const { PollVote } = sequelize.models;
    
    // Get all votes for this poll
    const votes = await PollVote.findAll({
      where: { pollId: this.id }
    });

    // Calculate vote counts
    const voteCounts = {};
    const uniqueVoters = new Set();

    votes.forEach(vote => {
      uniqueVoters.add(vote.userId);
      
      vote.optionIndices.forEach(index => {
        voteCounts[index] = (voteCounts[index] || 0) + 1;
      });
    });

    // Initialize vote counts for all options
    const finalVotes = {};
    this.options.forEach((option, index) => {
      finalVotes[index] = voteCounts[index] || 0;
    });

    // Update poll
    this.votes = finalVotes;
    this.totalVotes = votes.length;
    this.uniqueVoters = uniqueVoters.size;
    await this.save();
  };

  Poll.prototype.getResults = function() {
    const results = this.options.map((option, index) => ({
      index,
      text: option.text,
      image: option.image,
      votes: this.votes[index] || 0,
      percentage: this.totalVotes > 0 ? ((this.votes[index] || 0) / this.totalVotes * 100).toFixed(1) : 0
    }));

    return results.sort((a, b) => b.votes - a.votes);
  };

  Poll.prototype.getWinner = function() {
    const results = this.getResults();
    const maxVotes = Math.max(...results.map(r => r.votes));
    const winners = results.filter(r => r.votes === maxVotes);
    
    return winners.length === 1 ? winners[0] : winners;
  };

  Poll.prototype.close = async function() {
    this.isClosed = true;
    this.closedAt = new Date();
    
    // Calculate final results
    this.results = {
      totalVotes: this.totalVotes,
      uniqueVoters: this.uniqueVoters,
      options: this.getResults(),
      winner: this.getWinner(),
      closedAt: this.closedAt
    };
    
    await this.save();
  };

  Poll.prototype.reopen = async function() {
    this.isClosed = false;
    this.closedAt = null;
    this.results = null;
    await this.save();
  };

  Poll.prototype.archive = async function() {
    this.isActive = false;
    this.isClosed = true;
    await this.save();
  };

  // Class methods
  Poll.findChannelPolls = async function(channelId, options = {}) {
    const {
      page = 1,
      limit = 20,
      type = null,
      isActive = true,
      isClosed = null,
      authorId = null,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      channelId,
      isPublished: true
    };

    if (isActive !== null) {
      whereClause.isActive = isActive;
    }

    if (isClosed !== null) {
      whereClause.isClosed = isClosed;
    }

    if (type) {
      whereClause.type = type;
    }

    if (authorId) {
      whereClause.authorId = authorId;
    }

    const { count, rows } = await Poll.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.User,
          as: 'author',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ],
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit,
      offset
    });

    return {
      polls: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalPolls: count,
        limit
      }
    };
  };

  Poll.findActivePolls = async function(channelId = null) {
    const whereClause = {
      isActive: true,
      isPublished: true,
      isClosed: false
    };

    if (channelId) {
      whereClause.channelId = channelId;
    }

    // Check deadline
    whereClause[sequelize.Sequelize.Op.or] = [
      { deadline: null },
      { deadline: { [sequelize.Sequelize.Op.gt]: new Date() } }
    ];

    return await Poll.findAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.User,
          as: 'author',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ],
      order: [['created_at', 'DESC']]
    });
  };

  Poll.findUserPolls = async function(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      voted = null,
      channelId = null
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      authorId: userId,
      isPublished: true
    };

    if (channelId) {
      whereClause.channelId = channelId;
    }

    if (voted !== null) {
      const { PollVote } = sequelize.models;
      const votedPollIds = await PollVote.findAll({
        where: { userId },
        attributes: ['pollId'],
        raw: true
      }).then(votes => votes.map(v => v.pollId));

      if (voted) {
        whereClause.id = { [sequelize.Sequelize.Op.in]: votedPollIds };
      } else {
        whereClause.id = { [sequelize.Sequelize.Op.notIn]: votedPollIds };
      }
    }

    const { count, rows } = await Poll.findAndCountAll({
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
      polls: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalPolls: count,
        limit
      }
    };
  };

  // Hooks
  Poll.afterCreate(async (poll) => {
    // Update channel activity
    const channel = await sequelize.models.Channel.findByPk(poll.channelId);
    if (channel) {
      await channel.updateLastActivity();
    }
  });

  return Poll;
};
