const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ChannelBan = sequelize.define('ChannelBan', {
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
    bannedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'banned_by',
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Who banned the user'
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Reason for banning'
    },
    type: {
      type: DataTypes.ENUM('temporary', 'permanent', 'warning'),
      defaultValue: 'permanent',
      comment: 'Type of ban/restriction'
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Duration in hours for temporary bans'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
      comment: 'When the ban expires'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
      comment: 'Ban is currently active'
    },
    warnings: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of warnings before this ban'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional ban metadata'
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
    tableName: 'channel_bans',
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
        fields: ['banned_by']
      },
      {
        fields: ['type']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['created_at']
      },
      {
        unique: true,
        fields: ['channel_id', 'user_id']
      }
    ]
  });

  // Associations
  ChannelBan.associate = (models) => {
    // ChannelBan belongs to Channel
    ChannelBan.belongsTo(models.Channel, {
      as: 'channel',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });

    // ChannelBan belongs to banned User
    ChannelBan.belongsTo(models.User, {
      as: 'user',
      foreignKey: 'userId',
      onDelete: 'CASCADE'
    });

    // ChannelBan belongs to banner User
    ChannelBan.belongsTo(models.User, {
      as: 'banner',
      foreignKey: 'bannedBy',
      as: 'banner'
    });
  };

  // Instance methods
  ChannelBan.prototype.isExpired = function() {
    if (this.type === 'permanent') return false;
    if (!this.expiresAt) return false;
    return new Date() > new Date(this.expiresAt);
  };

  ChannelBan.prototype.isActive = function() {
    return this.isActive && !this.isExpired();
  };

  ChannelBan.prototype.lift = async function() {
    this.isActive = false;
    await this.save();

    // Also update channel member status
    const member = await sequelize.models.ChannelMember.findOne({
      where: {
        channelId: this.channelId,
        userId: this.userId
      }
    });

    if (member) {
      await member.unban();
    }
  };

  ChannelBan.prototype.extend = async function(additionalHours) {
    if (this.type === 'permanent') return;
    
    const currentExpiry = this.expiresAt || new Date();
    this.expiresAt = new Date(currentExpiry.getTime() + additionalHours * 60 * 60 * 1000);
    await this.save();
  };

  // Class methods
  ChannelBan.banUser = async function(channelId, userId, bannedBy, options = {}) {
    const {
      reason = null,
      type = 'permanent',
      duration = null,
      warnings = 0
    } = options;

    // Check if user is already banned
    const existingBan = await ChannelBan.findOne({
      where: {
        channelId,
        userId,
        isActive: true
      }
    });

    if (existingBan) {
      throw new Error('User is already banned from this channel');
    }

    // Calculate expiry time for temporary bans
    let expiresAt = null;
    if (type === 'temporary' && duration) {
      expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);
    }

    // Create ban record
    const ban = await ChannelBan.create({
      channelId,
      userId,
      bannedBy,
      reason,
      type,
      duration,
      expiresAt,
      warnings
    });

    // Update channel member status
    const member = await sequelize.models.ChannelMember.findOne({
      where: {
        channelId,
        userId
      }
    });

    if (member) {
      await member.ban(bannedBy, reason);
    } else {
      // Create member record with ban status
      await sequelize.models.ChannelMember.create({
        channelId,
        userId,
        role: 'member',
        isBanned: true,
        bannedAt: new Date(),
        bannedBy,
        banReason: reason,
        isActive: false
      });
    }

    return ban;
  };

  ChannelBan.unbanUser = async function(channelId, userId) {
    const ban = await ChannelBan.findOne({
      where: {
        channelId,
        userId,
        isActive: true
      }
    });

    if (!ban) {
      throw new Error('User is not banned from this channel');
    }

    await ban.lift();
    return ban;
  };

  ChannelBan.isBanned = async function(channelId, userId) {
    const ban = await ChannelBan.findOne({
      where: {
        channelId,
        userId,
        isActive: true
      }
    });

    if (!ban) return false;
    
    // Check if ban has expired
    if (ban.isExpired()) {
      await ban.lift();
      return false;
    }

    return true;
  };

  ChannelBan.getActiveBans = async function(channelId, options = {}) {
    const { page = null, limit = null } = options;

    const whereClause = {
      channelId,
      isActive: true
    };

    // Filter out expired bans
    whereClause[sequelize.Sequelize.Op.or] = [
      { type: 'permanent' },
      { expiresAt: { [sequelize.Sequelize.Op.gt]: new Date() } },
      { expiresAt: null }
    ];

    const queryOptions = {
      where: whereClause,
      include: [
        {
          model: sequelize.models.User,
          as: 'user',
          attributes: ['id', 'name', 'username', 'avatar']
        },
        {
          model: sequelize.models.User,
          as: 'banner',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ],
      order: [['created_at', 'DESC']]
    };

    if (page && limit) {
      const offset = (page - 1) * limit;
      queryOptions.limit = limit;
      queryOptions.offset = offset;
    }

    if (limit && !page) {
      queryOptions.limit = limit;
    }

    return await ChannelBan.findAll(queryOptions);
  };

  ChannelBan.getBanHistory = async function(channelId, userId) {
    return await ChannelBan.findAll({
      where: {
        channelId,
        userId
      },
      include: [
        {
          model: sequelize.models.User,
          as: 'banner',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ],
      order: [['created_at', 'DESC']]
    });
  };

  ChannelBan.getUserBans = async function(userId, options = {}) {
    const { page = 1, limit = 20, isActive = null } = options;
    const offset = (page - 1) * limit;

    const whereClause = { userId };

    if (isActive !== null) {
      whereClause.isActive = isActive;
    }

    const { count, rows } = await ChannelBan.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.Channel,
          as: 'channel',
          attributes: ['id', 'name', 'username', 'avatar']
        },
        {
          model: sequelize.models.User,
          as: 'banner',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      bans: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalBans: count,
        limit
      }
    };
  };

  ChannelBan.getStatistics = async function(channelId) {
    const stats = await ChannelBan.findAll({
      where: { channelId },
      attributes: [
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('user_id'))), 'totalBanned'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN is_active = true THEN 1 END')), 'activeBans'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN type = "temporary" THEN 1 END')), 'temporaryBans'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN type = "permanent" THEN 1 END')), 'permanentBans']
      ],
      raw: true
    });

    return stats[0];
  };

  // Cron job to expire temporary bans
  ChannelBan.expireTemporaryBans = async function() {
    const expiredBans = await ChannelBan.findAll({
      where: {
        type: 'temporary',
        isActive: true,
        expiresAt: {
          [sequelize.Sequelize.Op.lt]: new Date()
        }
      }
    });

    let expiredCount = 0;
    for (const ban of expiredBans) {
      await ban.lift();
      expiredCount++;
    }

    console.log(`Expired ${expiredCount} temporary bans`);
    return expiredCount;
  };

  // Hooks
  ChannelBan.afterCreate(async (ban) => {
    // Log ban action
    await sequelize.models.AdminLog.create({
      adminId: ban.bannedBy,
      action: 'channel_ban',
      details: {
        channelId: ban.channelId,
        userId: ban.userId,
        reason: ban.reason,
        type: ban.type,
        duration: ban.duration
      }
    });
  });

  return ChannelBan;
};
