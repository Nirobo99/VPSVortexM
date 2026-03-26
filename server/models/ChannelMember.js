const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ChannelMember = sequelize.define('ChannelMember', {
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
    role: {
      type: DataTypes.ENUM('member', 'admin', 'owner'),
      defaultValue: 'member',
      allowNull: false,
      comment: 'Member role in channel'
    },
    permissions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Custom permissions for admin role'
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'joined_at'
    },
    invitedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'invited_by',
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Who invited this user'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
      comment: 'Membership is active'
    },
    leftAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'left_at',
      comment: 'When user left the channel'
    },
    isMuted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_muted',
      comment: 'User is muted in channel'
    },
    mutedUntil: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'muted_until',
      comment: 'Mute expiration time'
    },
    isBanned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_banned',
      comment: 'User is banned from channel'
    },
    bannedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'banned_at',
      comment: 'When user was banned'
    },
    bannedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'banned_by',
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Who banned this user'
    },
    banReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'ban_reason',
      comment: 'Reason for ban'
    },
    canPost: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'can_post',
      comment: 'Can post in channel'
    },
    canComment: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'can_comment',
      comment: 'Can comment on posts'
    },
    canInvite: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'can_invite',
      comment: 'Can invite other users'
    },
    lastReadAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_read_at',
      comment: 'Last time user read channel'
    },
    unreadCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'unread_count',
      comment: 'Unread posts count'
    },
    notifications: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        posts: true,
        comments: true,
        mentions: true,
        newMembers: false
      },
      comment: 'Notification preferences'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional member metadata'
    }
  }, {
    tableName: 'channel_members',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['channel_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['role']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['is_banned']
      },
      {
        fields: ['joined_at']
      },
      {
        unique: true,
        fields: ['channel_id', 'user_id']
      }
    ]
  });

  // Associations
  ChannelMember.associate = (models) => {
    // ChannelMember belongs to Channel
    ChannelMember.belongsTo(models.Channel, {
      as: 'channel',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });

    // ChannelMember belongs to User
    ChannelMember.belongsTo(models.User, {
      as: 'user',
      foreignKey: 'userId',
      onDelete: 'CASCADE'
    });

    // ChannelMember belongs to inviter
    ChannelMember.belongsTo(models.User, {
      as: 'inviter',
      foreignKey: 'invitedBy',
      as: 'inviter'
    });

    // ChannelMember belongs to banner
    ChannelMember.belongsTo(models.User, {
      as: 'banner',
      foreignKey: 'bannedBy',
      as: 'banner'
    });
  };

  // Instance methods
  ChannelMember.prototype.isActiveMember = function() {
    return this.isActive && !this.isBanned && !this.leftAt;
  };

  ChannelMember.prototype.canPerformAction = function(action) {
    if (this.isBanned || !this.isActive) return false;
    
    if (this.role === 'owner') return true;
    if (this.role === 'admin') {
      return this.permissions?.[action] !== false;
    }
    
    switch (action) {
      case 'post':
        return this.canPost;
      case 'comment':
        return this.canComment;
      case 'invite':
        return this.canInvite;
      default:
        return false;
    }
  };

  ChannelMember.prototype.isOwner = function() {
    return this.role === 'owner';
  };

  ChannelMember.prototype.isAdmin = function() {
    return ['admin', 'owner'].includes(this.role);
  };

  ChannelMember.prototype.ban = async function(bannedBy, reason = null) {
    this.isBanned = true;
    this.bannedAt = new Date();
    this.bannedBy = bannedBy;
    this.banReason = reason;
    this.isActive = false;
    await this.save();
  };

  ChannelMember.prototype.unban = async function() {
    this.isBanned = false;
    this.bannedAt = null;
    this.bannedBy = null;
    this.banReason = null;
    this.isActive = true;
    await this.save();
  };

  ChannelMember.prototype.mute = async function(duration = null) {
    this.isMuted = true;
    this.mutedUntil = duration ? new Date(Date.now() + duration * 1000) : null;
    await this.save();
  };

  ChannelMember.prototype.unmute = async function() {
    this.isMuted = false;
    this.mutedUntil = null;
    await this.save();
  };

  ChannelMember.prototype.leave = async function() {
    this.isActive = false;
    this.leftAt = new Date();
    await this.save();
  };

  ChannelMember.prototype.rejoin = async function() {
    this.isActive = true;
    this.leftAt = null;
    this.isBanned = false;
    await this.save();
  };

  ChannelMember.prototype.updateUnreadCount = async function() {
    // Update unread count based on channel posts
    const { Post } = sequelize.models;
    const unreadPosts = await Post.count({
      where: {
        channelId: this.channelId,
        createdAt: {
          [sequelize.Sequelize.Op.gt]: this.lastReadAt || new Date(0)
        }
      }
    });
    
    this.unreadCount = unreadPosts;
    await this.save();
  };

  ChannelMember.prototype.markAsRead = async function() {
    this.lastReadAt = new Date();
    this.unreadCount = 0;
    await this.save();
  };

  // Class methods
  ChannelMember.addMember = async function(channelId, userId, options = {}) {
    const {
      role = 'member',
      invitedBy = null,
      permissions = null
    } = options;

    return await ChannelMember.findOrCreate({
      where: {
        channelId,
        userId
      },
      defaults: {
        role,
        invitedBy,
        permissions,
        isActive: true
      }
    });
  };

  ChannelMember.removeMember = async function(channelId, userId) {
    const member = await ChannelMember.findOne({
      where: {
        channelId,
        userId,
        isActive: true
      }
    });

    if (member) {
      await member.leave();
    }

    return member;
  };

  ChannelMember.getActiveMembers = async function(channelId, options = {}) {
    const { 
      page = null, 
      limit = null, 
      role = null 
    } = options;

    const whereClause = {
      channelId,
      isActive: true,
      isBanned: false
    };

    if (role) {
      whereClause.role = role;
    }

    const queryOptions = {
      where: whereClause,
      include: [{
        model: sequelize.models.User,
        as: 'user',
        attributes: ['id', 'name', 'avatar', 'username']
      }],
      order: [
        ['role', 'ASC'], // owner first, then admin, then member
        ['joined_at', 'ASC']
      ]
    };

    if (page && limit) {
      const offset = (page - 1) * limit;
      queryOptions.limit = limit;
      queryOptions.offset = offset;
    }

    if (limit && !page) {
      queryOptions.limit = limit;
    }

    return await ChannelMember.findAll(queryOptions);
  };

  ChannelMember.getAdmins = async function(channelId) {
    return await ChannelMember.getActiveMembers(channelId, {
      role: ['admin', 'owner']
    });
  };

  ChannelMember.isMember = async function(channelId, userId) {
    const member = await ChannelMember.findOne({
      where: {
        channelId,
        userId,
        isActive: true,
        isBanned: false
      }
    });
    return !!member;
  };

  ChannelMember.getMemberRole = async function(channelId, userId) {
    const member = await ChannelMember.findOne({
      where: {
        channelId,
        userId,
        isActive: true
      }
    });
    return member ? member.role : null;
  };

  ChannelMember.getMemberStats = async function(channelId) {
    const stats = await ChannelMember.findAll({
      where: { channelId },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN is_active = true AND is_banned = false THEN 1 END')), 'active'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN is_banned = true THEN 1 END')), 'banned'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN role = "admin" THEN 1 END')), 'admins']
      ],
      raw: true
    });

    return stats[0];
  };

  ChannelMember.getUserChannels = async function(userId, options = {}) {
    const { 
      page = 1, 
      limit = 20,
      role = null,
      isActive = true
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = { userId };

    if (isActive !== null) {
      whereClause.isActive = isActive;
    }

    if (role) {
      whereClause.role = role;
    }

    const { count, rows } = await ChannelMember.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.Channel,
          as: 'channel',
          attributes: ['id', 'name', 'username', 'avatar', 'type', 'memberCount']
        }
      ],
      order: [['joined_at', 'DESC']],
      limit,
      offset
    });

    return {
      memberships: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalMemberships: count,
        limit
      }
    };
  };

  // Hooks
  ChannelMember.afterCreate(async (member) => {
    // Update channel member count
    const channel = await sequelize.models.Channel.findByPk(member.channelId);
    if (channel) {
      await channel.updateMemberCount();
    }
  });

  ChannelMember.afterDestroy(async (member) => {
    // Update channel member count
    const channel = await sequelize.models.Channel.findByPk(member.channelId);
    if (channel) {
      await channel.updateMemberCount();
    }
  });

  return ChannelMember;
};
