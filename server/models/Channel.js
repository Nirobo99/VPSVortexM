const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Channel = sequelize.define('Channel', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        len: [3, 100],
        notEmpty: true
      }
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
      validate: {
        len: [3, 50],
        is: /^[a-zA-Z0-9_]+$/
      },
      comment: 'Unique channel username for public links (@channelname)'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    avatar: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Path to channel avatar image'
    },
    type: {
      type: DataTypes.ENUM('public', 'private'),
      defaultValue: 'public',
      allowNull: false,
      comment: 'Channel visibility type'
    },
    ownerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'owner_id',
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Channel owner/creator'
    },
    memberCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'member_count',
      comment: 'Cached member count'
    },
    postCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'post_count',
      comment: 'Cached post count'
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_verified',
      comment: 'Official verification badge'
    },
    inviteLink: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      field: 'invite_link',
      comment: 'Unique invite link for joining'
    },
    inviteCode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      field: 'invite_code',
      comment: 'Short invite code'
    },
    allowInvites: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'allow_invites',
      comment: 'Allow members to invite others'
    },
    requireApproval: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'require_approval',
      comment: 'Require owner approval for new members'
    },
    allowPosting: {
      type: DataTypes.ENUM('everyone', 'admins', 'owner'),
      defaultValue: 'everyone',
      field: 'allow_posting',
      comment: 'Who can post in channel'
    },
    allowComments: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'allow_comments',
      comment: 'Allow commenting on posts'
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_archived',
      comment: 'Channel is archived'
    },
    archivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'archived_at'
    },
    settings: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional channel settings'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Channel metadata for SEO, etc.'
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Channel tags for discovery'
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Channel category'
    },
    language: {
      type: DataTypes.STRING(10),
      defaultValue: 'ru',
      comment: 'Primary language of channel'
    },
    location: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Geographic location'
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'External website URL'
    },
    socialLinks: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Social media links'
    },
    statistics: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      comment: 'Channel statistics (views, engagement, etc.)'
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_activity_at',
      comment: 'Last activity timestamp'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
      comment: 'Channel is active'
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
    tableName: 'channels',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['owner_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['username']
      },
      {
        fields: ['invite_link']
      },
      {
        fields: ['invite_code']
      },
      {
        fields: ['category']
      },
      {
        fields: ['is_verified']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['member_count']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['last_activity_at']
      },
      {
        type: 'FULLTEXT',
        fields: ['name', 'description']
      }
    ]
  });

  // Associations
  Channel.associate = (models) => {
    // Channel belongs to owner
    Channel.belongsTo(models.User, {
      as: 'owner',
      foreignKey: 'ownerId'
    });

    // Channel has many members
    Channel.hasMany(models.ChannelMember, {
      as: 'members',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });

    // Channel has many posts
    Channel.hasMany(models.Post, {
      as: 'posts',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });

    // Channel has many products
    Channel.hasMany(models.Product, {
      as: 'products',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });

    // Channel has many polls
    Channel.hasMany(models.Poll, {
      as: 'polls',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });

    // Channel has many events
    Channel.hasMany(models.Event, {
      as: 'events',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });

    // Channel has many bans
    Channel.hasMany(models.ChannelBan, {
      as: 'bannedUsers',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  Channel.prototype.isOwner = function(userId) {
    return this.ownerId === userId;
  };

  Channel.prototype.isMember = async function(userId) {
    const member = await this.getMembers({
      where: { userId },
      limit: 1
    });
    return member.length > 0;
  };

  Channel.prototype.isAdmin = async function(userId) {
    const member = await this.getMembers({
      where: { userId, role: ['admin', 'owner'] },
      limit: 1
    });
    return member.length > 0;
  };

  Channel.prototype.canPost = async function(userId) {
    if (this.isOwner(userId)) return true;
    
    if (this.allowPosting === 'everyone') {
      return await this.isMember(userId);
    }
    
    if (this.allowPosting === 'admins') {
      return await this.isAdmin(userId);
    }
    
    return false;
  };

  Channel.prototype.generateInviteLink = function() {
    const code = Math.random().toString(36).substring(2, 15);
    this.inviteCode = code;
    this.inviteLink = `https://vortexym.com/join/${code}`;
    return this.inviteLink;
  };

  Channel.prototype.updateMemberCount = async function() {
    const count = await this.getMembers({
      where: { isActive: true }
    });
    this.memberCount = count.length;
    await this.save();
  };

  Channel.prototype.updatePostCount = async function() {
    const count = await this.getPosts({
      where: { isActive: true }
    });
    this.postCount = count.length;
    await this.save();
  };

  Channel.prototype.updateLastActivity = async function() {
    this.lastActivityAt = new Date();
    await this.save();
  };

  // Class methods
  Channel.findPublicChannels = async function(options = {}) {
    const { 
      page = 1, 
      limit = 20, 
      category = null, 
      search = null,
      sortBy = 'memberCount',
      sortOrder = 'DESC'
    } = options;
    
    const offset = (page - 1) * limit;
    const whereClause = {
      type: 'public',
      isActive: true,
      isArchived: false
    };

    if (category) {
      whereClause.category = category;
    }

    if (search) {
      whereClause[sequelize.Sequelize.Op.or] = [
        { name: { [sequelize.Sequelize.Op.like]: `%${search}%` } },
        { description: { [sequelize.Sequelize.Op.like]: `%${search}%` } }
      ];
    }

    const order = [[sortBy, sortOrder.toUpperCase()]];

    const { count, rows } = await Channel.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.User,
          as: 'owner',
          attributes: ['id', 'name', 'avatar']
        }
      ],
      order,
      limit,
      offset
    });

    return {
      channels: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalChannels: count,
        limit
      }
    };
  };

  Channel.findUserChannels = async function(userId, options = {}) {
    const { page = 1, limit = 20, type = null } = options;
    const offset = (page - 1) * limit;

    const { count, rows } = await Channel.findAndCountAll({
      where: {
        ownerId: userId,
        ...(type && { type })
      },
      include: [
        {
          model: sequelize.models.ChannelMember,
          as: 'members',
          attributes: ['id', 'userId', 'role', 'joinedAt']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      channels: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalChannels: count,
        limit
      }
    };
  };

  Channel.findByUsername = async function(username) {
    return await Channel.findOne({
      where: { username, isActive: true },
      include: [
        {
          model: sequelize.models.User,
          as: 'owner',
          attributes: ['id', 'name', 'avatar']
        }
      ]
    });
  };

  Channel.findByInviteCode = async function(inviteCode) {
    return await Channel.findOne({
      where: { inviteCode, isActive: true },
      include: [
        {
          model: sequelize.models.User,
          as: 'owner',
          attributes: ['id', 'name', 'avatar']
        }
      ]
    });
  };

  Channel.getTrendingChannels = async function(limit = 10) {
    return await Channel.findAll({
      where: {
        type: 'public',
        isActive: true,
        isArchived: false
      },
      order: [
        ['memberCount', 'DESC'],
        ['postCount', 'DESC']
      ],
      limit,
      include: [
        {
          model: sequelize.models.User,
          as: 'owner',
          attributes: ['id', 'name', 'avatar']
        }
      ]
    });
  };

  // Hooks
  Channel.beforeCreate(async (channel) => {
    if (!channel.inviteCode) {
      channel.generateInviteLink();
    }
  });

  Channel.beforeUpdate(async (channel) => {
    if (channel.changed('type') && channel.type === 'private') {
      // Reset invite link when making channel private
      channel.generateInviteLink();
    }
  });

  return Channel;
};
