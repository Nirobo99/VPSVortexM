const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ChannelBroadcast = sequelize.define('ChannelBroadcast', {
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
    senderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'sender_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    type: {
      type: DataTypes.ENUM('announcement', 'notification', 'alert', 'update', 'promotion', 'welcome', 'goodbye'),
      allowNull: false,
      defaultValue: 'announcement',
      comment: 'Type of broadcast message'
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Broadcast title/headline'
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 2000]
      }
    },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
      defaultValue: 'normal',
      comment: 'Broadcast priority level'
    },
    targetAudience: {
      type: DataTypes.ENUM('all', 'members', 'admins', 'new_members', 'active_members', 'inactive_members'),
      defaultValue: 'all',
      field: 'target_audience',
      comment: 'Target audience for the broadcast'
    },
    deliveryMethod: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: ['in_app'],
      comment: 'Delivery methods: in_app, email, push, sms'
    },
    attachments: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Media attachments for broadcast'
    },
    mentions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'User mentions in broadcast'
    },
    hashtags: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Hashtags in broadcast'
    },
    isScheduled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_scheduled',
      comment: 'Broadcast is scheduled for later'
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'scheduled_at',
      comment: 'When to send the broadcast'
    },
    isRecurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_recurring',
      comment: 'Broadcast is recurring'
    },
    recurrencePattern: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      field: 'recurrence_pattern',
      comment: 'Recurrence pattern (daily, weekly, monthly)'
    },
    status: {
      type: DataTypes.ENUM('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'),
      defaultValue: 'draft',
      comment: 'Broadcast status'
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sent_at',
      comment: 'When broadcast was sent'
    },
    deliveryStats: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      field: 'delivery_stats',
      comment: 'Delivery statistics and metrics'
    },
    settings: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        allowReplies: false,
        allowReactions: false,
        requireConfirmation: false,
        maxRetries: 3,
        retryDelay: 300 // 5 minutes
      },
      comment: 'Broadcast settings and options'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional broadcast metadata'
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
    tableName: 'channel_broadcasts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['channel_id']
      },
      {
        fields: ['sender_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['priority']
      },
      {
        fields: ['status']
      },
      {
        fields: ['target_audience']
      },
      {
        fields: ['is_scheduled']
      },
      {
        fields: ['scheduled_at']
      },
      {
        fields: ['sent_at']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  // Associations
  ChannelBroadcast.associate = (models) => {
    // ChannelBroadcast belongs to Channel
    ChannelBroadcast.belongsTo(models.Channel, {
      as: 'channel',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });

    // ChannelBroadcast belongs to Sender
    ChannelBroadcast.belongsTo(models.User, {
      as: 'sender',
      foreignKey: 'senderId'
    });

    // ChannelBroadcast has many deliveries
    ChannelBroadcast.hasMany(models.BroadcastDelivery, {
      as: 'deliveries',
      foreignKey: 'broadcastId',
      onDelete: 'CASCADE'
    });

    // ChannelBroadcast has many replies
    ChannelBroadcast.hasMany(models.BroadcastReply, {
      as: 'replies',
      foreignKey: 'broadcastId',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  ChannelBroadcast.prototype.canSend = async function(userId) {
    // Check if user can send broadcasts in channel
    const channel = await sequelize.models.Channel.findByPk(this.channelId);
    if (!channel) return false;

    const isAdmin = await channel.isAdmin(userId);
    const isOwner = channel.ownerId === userId;
    
    return isAdmin || isOwner;
  };

  ChannelBroadcast.prototype.getTargetUsers = async function() {
    const { ChannelMember, User } = sequelize.models;
    
    let whereClause = {
      channelId: this.channelId,
      isActive: true,
      isBanned: false
    };

    // Filter by target audience
    switch (this.targetAudience) {
      case 'admins':
        whereClause.role = ['admin', 'owner'];
        break;
      
      case 'new_members':
        whereClause.joinedAt = {
          [sequelize.Sequelize.Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        };
        break;
      
      case 'active_members':
        whereClause.lastSeenAt = {
          [sequelize.Sequelize.Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        };
        break;
      
      case 'inactive_members':
        whereClause.lastSeenAt = {
          [sequelize.Sequelize.Op.lt]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // More than 30 days ago
        };
        break;
      
      // 'all' and 'members' use default filter
    }

    const members = await ChannelMember.findAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'username', 'email', 'pushToken']
      }]
    });

    return members.map(member => member.user);
  };

  ChannelBroadcast.prototype.send = async function() {
    if (this.status !== 'draft' && this.status !== 'scheduled') {
      throw new Error('Broadcast can only be sent from draft or scheduled status');
    }

    this.status = 'sending';
    await this.save();

    try {
      const targetUsers = await this.getTargetUsers();
      const deliveryStats = {
        total: targetUsers.length,
        sent: 0,
        failed: 0,
        pending: 0,
        methods: {}
      };

      // Initialize delivery stats for each method
      this.settings.deliveryMethod.forEach(method => {
        deliveryStats.methods[method] = { sent: 0, failed: 0 };
      });

      const { BroadcastDelivery } = sequelize.models;

      // Create delivery records for each user
      for (const user of targetUsers) {
        for (const method of this.settings.deliveryMethod) {
          await BroadcastDelivery.create({
            broadcastId: this.id,
            userId: user.id,
            method,
            status: 'pending',
            scheduledAt: new Date()
          });
        }
        deliveryStats.pending++;
      }

      // Process deliveries
      await this.processDeliveries();

      // Update final status
      this.status = 'sent';
      this.sentAt = new Date();
      this.deliveryStats = deliveryStats;
      await this.save();

      return deliveryStats;

    } catch (error) {
      this.status = 'failed';
      await this.save();
      throw error;
    }
  };

  ChannelBroadcast.prototype.processDeliveries = async function() {
    const { BroadcastDelivery } = sequelize.models;
    const io = require('../socket').io;

    const pendingDeliveries = await BroadcastDelivery.findAll({
      where: {
        broadcastId: this.id,
        status: 'pending'
      },
      include: [{
        model: sequelize.models.User,
        as: 'user',
        attributes: ['id', 'name', 'username', 'email', 'pushToken']
      }]
    });

    for (const delivery of pendingDeliveries) {
      try {
        let success = false;

        switch (delivery.method) {
          case 'in_app':
            success = await this.sendInAppDelivery(delivery);
            break;
          
          case 'email':
            success = await this.sendEmailDelivery(delivery);
            break;
          
          case 'push':
            success = await this.sendPushDelivery(delivery);
            break;
          
          case 'sms':
            success = await this.sendSMSDelivery(delivery);
            break;
        }

        if (success) {
          delivery.status = 'sent';
          delivery.deliveredAt = new Date();
          
          // Update stats
          if (!this.deliveryStats) this.deliveryStats = { methods: {} };
          if (!this.deliveryStats.methods[delivery.method]) {
            this.deliveryStats.methods[delivery.method] = { sent: 0, failed: 0 };
          }
          this.deliveryStats.methods[delivery.method].sent++;
          this.deliveryStats.sent++;
        } else {
          delivery.status = 'failed';
          delivery.failureReason = 'Delivery failed';
          
          // Update stats
          if (!this.deliveryStats) this.deliveryStats = { methods: {} };
          if (!this.deliveryStats.methods[delivery.method]) {
            this.deliveryStats.methods[delivery.method] = { sent: 0, failed: 0 };
          }
          this.deliveryStats.methods[delivery.method].failed++;
          this.deliveryStats.failed++;
        }

        await delivery.save();

      } catch (error) {
        delivery.status = 'failed';
        delivery.failureReason = error.message;
        await delivery.save();
      }
    }

    await this.save();
  };

  ChannelBroadcast.prototype.sendInAppDelivery = async function(delivery) {
    const io = require('../socket').io;
    
    // Get user's socket ID
    const socketId = await redis.get(`user_socket:${delivery.userId}`);
    
    if (socketId) {
      io.to(socketId).emit('channel_broadcast', {
        id: this.id,
        channelId: this.channelId,
        type: this.type,
        title: this.title,
        content: this.content,
        priority: this.priority,
        attachments: this.attachments,
        sender: {
          id: this.senderId,
          name: (await sequelize.models.User.findByPk(this.senderId))?.name
        },
        sentAt: this.sentAt
      });
      
      return true;
    }
    
    return false;
  };

  ChannelBroadcast.prototype.sendEmailDelivery = async function(delivery) {
    // TODO: Implement email delivery
    console.log(`Sending email broadcast to ${delivery.user.email}`);
    return true;
  };

  ChannelBroadcast.prototype.sendPushDelivery = async function(delivery) {
    // TODO: Implement push notification delivery
    console.log(`Sending push notification to ${delivery.user.pushToken}`);
    return true;
  };

  ChannelBroadcast.prototype.sendSMSDelivery = async function(delivery) {
    // TODO: Implement SMS delivery
    console.log(`Sending SMS to ${delivery.user.phone}`);
    return false;
  };

  ChannelBroadcast.prototype.cancel = async function() {
    if (this.status === 'sent') {
      throw new Error('Cannot cancel sent broadcast');
    }

    this.status = 'cancelled';
    await this.save();

    // Cancel pending deliveries
    const { BroadcastDelivery } = sequelize.models;
    await BroadcastDelivery.update(
      { status: 'cancelled' },
      { where: { broadcastId: this.id, status: 'pending' } }
    );

    return true;
  };

  ChannelBroadcast.prototype.schedule = async function(scheduledAt) {
    if (this.status !== 'draft') {
      throw new Error('Only draft broadcasts can be scheduled');
    }

    this.isScheduled = true;
    this.scheduledAt = new Date(scheduledAt);
    this.status = 'scheduled';
    await this.save();

    return this;
  };

  // Class methods
  ChannelBroadcast.findScheduledBroadcasts = async function() {
    return await ChannelBroadcast.findAll({
      where: {
        status: 'scheduled',
        scheduledAt: {
          [sequelize.Sequelize.Op.lte]: new Date()
        }
      },
      include: [
        {
          model: sequelize.models.Channel,
          as: 'channel',
          attributes: ['id', 'name']
        },
        {
          model: sequelize.models.User,
          as: 'sender',
          attributes: ['id', 'name']
        }
      ]
    });
  };

  ChannelBroadcast.sendScheduledBroadcasts = async function() {
    const scheduledBroadcasts = await ChannelBroadcast.findScheduledBroadcasts();
    let sentCount = 0;

    for (const broadcast of scheduledBroadcasts) {
      try {
        await broadcast.send();
        sentCount++;
        console.log(`Sent scheduled broadcast ${broadcast.id}`);
      } catch (error) {
        console.error(`Failed to send scheduled broadcast ${broadcast.id}:`, error);
      }
    }

    return sentCount;
  };

  ChannelBroadcast.getChannelBroadcasts = async function(channelId, options = {}) {
    const {
      page = 1,
      limit = 20,
      type = null,
      status = null,
      senderId = null,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = { channelId };

    if (type) whereClause.type = type;
    if (status) whereClause.status = status;
    if (senderId) whereClause.senderId = senderId;

    const { count, rows } = await ChannelBroadcast.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.User,
          as: 'sender',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ],
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit,
      offset
    });

    return {
      broadcasts: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalBroadcasts: count,
        limit
      }
    };
  };

  ChannelBroadcast.getBroadcastStats = async function(channelId, userId) {
    // Check if user can view stats
    const channel = await sequelize.models.Channel.findByPk(channelId);
    const isAdmin = await channel.isAdmin(userId);
    
    if (!isAdmin) {
      throw new Error('Only channel admins can view broadcast statistics');
    }

    const stats = await ChannelBroadcast.findAll({
      where: { channelId },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN status = "sent" THEN 1 END')), 'sent'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN status = "failed" THEN 1 END')), 'failed'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN status = "scheduled" THEN 1 END')), 'scheduled'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN delivery_stats IS NOT NULL THEN JSON_EXTRACT(delivery_stats, "$.sent") ELSE 0 END')), 'totalDelivered']
      ],
      raw: true
    });

    return stats[0];
  };

  // Hooks
  ChannelBroadcast.afterCreate(async (broadcast) => {
    // Log broadcast creation
    await sequelize.models.AdminLog.create({
      adminId: broadcast.senderId,
      action: 'channel_broadcast_create',
      details: {
        broadcastId: broadcast.id,
        channelId: broadcast.channelId,
        type: broadcast.type,
        targetAudience: broadcast.targetAudience
      }
    });
  });

  return ChannelBroadcast;
};
