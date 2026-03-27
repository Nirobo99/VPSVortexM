const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BroadcastDelivery = sequelize.define('BroadcastDelivery', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    broadcastId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'broadcast_id',
      references: {
        model: 'channel_broadcasts',
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
    method: {
      type: DataTypes.ENUM('in_app', 'email', 'push', 'sms'),
      allowNull: false,
      comment: 'Delivery method used'
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'failed', 'cancelled'),
      defaultValue: 'pending',
      comment: 'Delivery status'
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'scheduled_at',
      comment: 'When delivery was scheduled'
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sent_at',
      comment: 'When delivery was sent'
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'delivered_at',
      comment: 'When delivery was confirmed delivered'
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'read_at',
      comment: 'When message was read by user'
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'failure_reason',
      comment: 'Reason for delivery failure'
    },
    retryCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'retry_count',
      comment: 'Number of retry attempts'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional delivery metadata'
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
    tableName: 'broadcast_deliveries',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['broadcast_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['method']
      },
      {
        fields: ['status']
      },
      {
        fields: ['scheduled_at']
      },
      {
        fields: ['sent_at']
      },
      {
        fields: ['delivered_at']
      },
      {
        fields: ['read_at']
      },
      {
        unique: true,
        fields: ['broadcast_id', 'user_id', 'method']
      }
    ]
  });

  // Associations
  BroadcastDelivery.associate = (models) => {
    // BroadcastDelivery belongs to Broadcast
    BroadcastDelivery.belongsTo(models.ChannelBroadcast, {
      as: 'broadcast',
      foreignKey: 'broadcastId',
      onDelete: 'CASCADE'
    });

    // BroadcastDelivery belongs to User
    BroadcastDelivery.belongsTo(models.User, {
      as: 'user',
      foreignKey: 'userId',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  BroadcastDelivery.prototype.markAsSent = async function() {
    this.status = 'sent';
    this.sentAt = new Date();
    await this.save();
  };

  BroadcastDelivery.prototype.markAsDelivered = async function() {
    this.status = 'sent';
    this.deliveredAt = new Date();
    await this.save();
  };

  BroadcastDelivery.prototype.markAsRead = async function() {
    this.readAt = new Date();
    await this.save();
  };

  BroadcastDelivery.prototype.markAsFailed = async function(reason) {
    this.status = 'failed';
    this.failureReason = reason;
    await this.save();
  };

  BroadcastDelivery.prototype.markAsCancelled = async function() {
    this.status = 'cancelled';
    await this.save();
  };

  BroadcastDelivery.prototype.canRetry = function(maxRetries = 3) {
    return this.status === 'failed' && this.retryCount < maxRetries;
  };

  BroadcastDelivery.prototype.incrementRetry = async function() {
    this.retryCount += 1;
    this.status = 'pending';
    await this.save();
  };

  // Class methods
  BroadcastDelivery.getDeliveryStats = async function(broadcastId) {
    const stats = await BroadcastDelivery.findAll({
      where: { broadcastId },
      attributes: [
        'method',
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN status = "sent" THEN 1 END')), 'sent'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN status = "failed" THEN 1 END')), 'failed'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN status = "pending" THEN 1 END')), 'pending'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN read_at IS NOT NULL THEN 1 END')), 'read']
      ],
      group: ['method'],
      raw: true
    });

    return stats.map(stat => ({
      method: stat.method,
      total: parseInt(stat.total),
      sent: parseInt(stat.sent),
      failed: parseInt(stat.failed),
      pending: parseInt(stat.pending),
      read: parseInt(stat.read),
      deliveryRate: stat.total > 0 ? (stat.sent / stat.total * 100).toFixed(1) : 0,
      readRate: stat.sent > 0 ? (stat.read / stat.sent * 100).toFixed(1) : 0
    }));
  };

  BroadcastDelivery.getUserDeliveries = async function(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      status = null,
      method = null,
      unreadOnly = false
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = { userId };

    if (status) whereClause.status = status;
    if (method) whereClause.method = method;
    if (unreadOnly) whereClause.readAt = null;

    const { count, rows } = await BroadcastDelivery.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.ChannelBroadcast,
          as: 'broadcast',
          include: [
            {
              model: sequelize.models.Channel,
              as: 'channel',
              attributes: ['id', 'name', 'username']
            },
            {
              model: sequelize.models.User,
              as: 'sender',
              attributes: ['id', 'name', 'username', 'avatar']
            }
          ]
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      deliveries: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalDeliveries: count,
        limit
      }
    };
  };

  BroadcastDelivery.markAsReadForUser = async function(userId, broadcastId = null) {
    const whereClause = { userId, readAt: null };
    
    if (broadcastId) {
      whereClause.broadcastId = broadcastId;
    }

    const [updatedCount] = await BroadcastDelivery.update(
      { readAt: new Date() },
      { where: whereClause }
    );

    return updatedCount;
  };

  BroadcastDelivery.getUnreadCount = async function(userId) {
    return await BroadcastDelivery.count({
      where: {
        userId,
        readAt: null,
        status: 'sent'
      }
    });
  };

  BroadcastDelivery.retryFailedDeliveries = async function(broadcastId, maxRetries = 3) {
    const failedDeliveries = await BroadcastDelivery.findAll({
      where: {
        broadcastId,
        status: 'failed',
        retryCount: {
          [sequelize.Sequelize.Op.lt]: maxRetries
        }
      }
    });

    let retriedCount = 0;
    
    for (const delivery of failedDeliveries) {
      await delivery.incrementRetry();
      retriedCount++;
    }

    return retriedCount;
  };

  return BroadcastDelivery;
};
