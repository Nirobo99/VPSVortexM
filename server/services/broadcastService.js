const { 
  ChannelBroadcast, 
  BroadcastDelivery, 
  BroadcastReply,
  Channel, 
  ChannelMember, 
  User,
  AdminLog 
} = require('../models');

/**
 * Service for managing channel broadcasts and mass messaging
 */
class BroadcastService {
  /**
   * Create a new broadcast
   */
  async createBroadcast(channelId, senderId, broadcastData) {
    const {
      type = 'announcement',
      title,
      content,
      priority = 'normal',
      targetAudience = 'all',
      deliveryMethod = ['in_app'],
      attachments = [],
      mentions = [],
      hashtags = [],
      isScheduled = false,
      scheduledAt = null,
      isRecurring = false,
      recurrencePattern = null,
      settings = {}
    } = broadcastData;

    // Check if user can send broadcasts
    const channel = await Channel.findByPk(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const canSend = await this.canSendBroadcast(channelId, senderId);
    if (!canSend) {
      throw new Error('You do not have permission to send broadcasts in this channel');
    }

    // Validate content
    if (!content || content.trim().length === 0) {
      throw new Error('Broadcast content is required');
    }

    // Create broadcast
    const broadcast = await ChannelBroadcast.create({
      channelId,
      senderId,
      type,
      title: title?.trim() || null,
      content: content.trim(),
      priority,
      targetAudience,
      deliveryMethod,
      attachments,
      mentions,
      hashtags,
      isScheduled,
      scheduledAt: isScheduled && scheduledAt ? new Date(scheduledAt) : null,
      isRecurring,
      recurrencePattern,
      settings: {
        allowReplies: false,
        allowReactions: false,
        requireConfirmation: false,
        maxRetries: 3,
        retryDelay: 300,
        ...settings
      }
    });

    // If not scheduled, send immediately
    if (!isScheduled) {
      await this.sendBroadcast(broadcast.id);
    }

    // Log broadcast creation
    await AdminLog.create({
      adminId: senderId,
      action: 'broadcast_create',
      details: {
        broadcastId: broadcast.id,
        channelId,
        type: broadcast.type,
        targetAudience: broadcast.targetAudience
      }
    });

    return broadcast;
  }

  /**
   * Send a broadcast immediately
   */
  async sendBroadcast(broadcastId) {
    const broadcast = await ChannelBroadcast.findByPk(broadcastId);
    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    return await broadcast.send();
  }

  /**
   * Schedule a broadcast for later
   */
  async scheduleBroadcast(broadcastId, scheduledAt) {
    const broadcast = await ChannelBroadcast.findByPk(broadcastId);
    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    return await broadcast.schedule(scheduledAt);
  }

  /**
   * Cancel a broadcast
   */
  async cancelBroadcast(broadcastId, userId) {
    const broadcast = await ChannelBroadcast.findByPk(broadcastId);
    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    // Check if user can cancel
    const canSend = await this.canSendBroadcast(broadcast.channelId, userId);
    if (!canSend) {
      throw new Error('You do not have permission to cancel this broadcast');
    }

    return await broadcast.cancel();
  }

  /**
   * Get channel broadcasts
   */
  async getChannelBroadcasts(channelId, userId, options = {}) {
    // Check if user can access channel
    const canAccess = await require('./channelPrivacyService').channelPrivacyService.canAccessChannel(channelId, userId);
    if (!canAccess.canAccess) {
      throw new Error(canAccess.reason);
    }

    const {
      page = 1,
      limit = 20,
      type = null,
      status = null,
      senderId = null,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    return await ChannelBroadcast.getChannelBroadcasts(channelId, {
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      status,
      senderId,
      sortBy,
      sortOrder
    });
  }

  /**
   * Get broadcast details
   */
  async getBroadcast(broadcastId, userId) {
    const broadcast = await ChannelBroadcast.findByPk(broadcastId, {
      include: [
        {
          model: Channel,
          as: 'channel',
          attributes: ['id', 'name', 'username', 'type']
        },
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ]
    });

    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    // Check if user can access channel
    const canAccess = await require('./channelPrivacyService').channelPrivacyService.canAccessChannel(broadcast.channelId, userId);
    if (!canAccess.canAccess) {
      throw new Error(canAccess.reason);
    }

    // Get delivery stats
    const deliveryStats = await BroadcastDelivery.getDeliveryStats(broadcastId);

    // Get replies if allowed
    let replies = [];
    if (broadcast.settings.allowReplies) {
      replies = await BroadcastReply.findAll({
        where: { 
          broadcastId,
          isPublic: true 
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'username', 'avatar']
        }],
        order: [['created_at', 'ASC']],
        limit: 50
      });
    }

    return {
      broadcast: {
        ...broadcast.toJSON(),
        deliveryStats,
        replies: replies.map(reply => ({
          id: reply.id,
          content: reply.content,
          type: reply.type,
          user: reply.user,
          createdAt: reply.createdAt
        }))
      }
    };
  }

  /**
   * Add reply to broadcast
   */
  async addReply(broadcastId, userId, replyData) {
    const { content, type = 'text', isPublic = true } = replyData;

    const broadcast = await ChannelBroadcast.findByPk(broadcastId);
    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    // Check if user can access channel
    const canAccess = await require('./channelPrivacyService').channelPrivacyService.canAccessChannel(broadcast.channelId, userId);
    if (!canAccess.canAccess) {
      throw new Error(canAccess.reason);
    }

    // Check if replies are allowed
    if (!broadcast.settings.allowReplies) {
      throw new Error('Replies are not allowed for this broadcast');
    }

    // Validate content
    if (!content || content.trim().length === 0) {
      throw new Error('Reply content is required');
    }

    const reply = await BroadcastReply.create({
      broadcastId,
      userId,
      content: content.trim(),
      type,
      isPublic
    });

    // Emit Socket.IO event for real-time replies
    const io = require('../socket').io;
    io.emit('broadcast_reply', {
      broadcastId,
      replyId: reply.id,
      user: {
        id: userId,
        name: (await User.findByPk(userId))?.name
      },
      content: reply.content,
      type: reply.type,
      isPublic: reply.isPublic
    });

    return reply;
  }

  /**
   * Get user's broadcast deliveries
   */
  async getUserDeliveries(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      status = null,
      method = null,
      unreadOnly = false
    } = options;

    return await BroadcastDelivery.getUserDeliveries(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      method,
      unreadOnly
    });
  }

  /**
   * Mark broadcast as read
   */
  async markAsRead(userId, broadcastId = null) {
    const updatedCount = await BroadcastDelivery.markAsReadForUser(userId, broadcastId);
    
    // Update unread count
    const unreadCount = await BroadcastDelivery.getUnreadCount(userId);
    
    return {
      markedAsRead: updatedCount,
      unreadCount
    };
  }

  /**
   * Get unread broadcasts count
   */
  async getUnreadCount(userId) {
    return await BroadcastDelivery.getUnreadCount(userId);
  }

  /**
   * Get broadcast statistics
   */
  async getBroadcastStats(channelId, userId) {
    return await ChannelBroadcast.getBroadcastStats(channelId, userId);
  }

  /**
   * Process scheduled broadcasts
   */
  async processScheduledBroadcasts() {
    return await ChannelBroadcast.sendScheduledBroadcasts();
  }

  /**
   * Retry failed deliveries
   */
  async retryFailedDeliveries(broadcastId, maxRetries = 3) {
    return await BroadcastDelivery.retryFailedDeliveries(broadcastId, maxRetries);
  }

  /**
   * Check if user can send broadcasts
   */
  async canSendBroadcast(channelId, userId) {
    const channel = await Channel.findByPk(channelId);
    if (!channel) return false;

    const isAdmin = await channel.isAdmin(userId);
    const isOwner = channel.ownerId === userId;
    
    return isAdmin || isOwner;
  }

  /**
   * Create recurring broadcast
   */
  async createRecurringBroadcast(channelId, senderId, broadcastData) {
    const {
      content,
      type = 'announcement',
      targetAudience = 'all',
      deliveryMethod = ['in_app'],
      recurrencePattern,
      settings = {}
    } = broadcastData;

    if (!recurrencePattern || !recurrencePattern.type) {
      throw new Error('Recurrence pattern is required for recurring broadcasts');
    }

    // Validate recurrence pattern
    const validTypes = ['daily', 'weekly', 'monthly'];
    if (!validTypes.includes(recurrencePattern.type)) {
      throw new Error('Invalid recurrence type');
    }

    // Create first broadcast
    const broadcast = await this.createBroadcast(channelId, senderId, {
      type,
      content,
      targetAudience,
      deliveryMethod,
      isRecurring: true,
      recurrencePattern,
      settings
    });

    return broadcast;
  }

  /**
   * Get broadcast templates
   */
  async getBroadcastTemplates(channelId, userId) {
    // Check if user can access channel
    const canAccess = await require('./channelPrivacyService').channelPrivacyService.canAccessChannel(channelId, userId);
    if (!canAccess.canAccess) {
      throw new Error(canAccess.reason);
    }

    // Return predefined templates
    const templates = [
      {
        id: 'welcome',
        name: 'Welcome Message',
        type: 'welcome',
        title: 'Welcome to our channel!',
        content: 'Thank you for joining our channel. We\'re excited to have you here!',
        targetAudience: 'new_members'
      },
      {
        id: 'announcement',
        name: 'General Announcement',
        type: 'announcement',
        title: 'Important Announcement',
        content: 'We have an important announcement to share with our community.',
        targetAudience: 'all'
      },
      {
        id: 'promotion',
        name: 'Promotion',
        type: 'promotion',
        title: 'Special Offer!',
        content: 'Check out our latest promotion available for a limited time.',
        targetAudience: 'all'
      },
      {
        id: 'update',
        name: 'Channel Update',
        type: 'update',
        title: 'Channel Update',
        content: 'Here are the latest updates and improvements to our channel.',
        targetAudience: 'members'
      }
    ];

    return { templates };
  }

  /**
   * Send test broadcast
   */
  async sendTestBroadcast(channelId, senderId, testData) {
    const { content, deliveryMethod = ['in_app'] } = testData;

    // Create test broadcast
    const broadcast = await ChannelBroadcast.create({
      channelId,
      senderId,
      type: 'announcement',
      title: 'Test Broadcast',
      content: content || 'This is a test broadcast',
      priority: 'normal',
      targetAudience: 'admins', // Only send to admins for testing
      deliveryMethod,
      metadata: { isTest: true }
    });

    // Send immediately
    await this.sendBroadcast(broadcast.id);

    return broadcast;
  }

  /**
   * Export broadcast statistics
   */
  async exportBroadcastStats(channelId, userId, format = 'json') {
    const stats = await this.getBroadcastStats(channelId, userId);
    const broadcasts = await this.getChannelBroadcasts(channelId, userId, { limit: 1000 });

    const exportData = {
      channelId,
      exportedAt: new Date(),
      stats,
      broadcasts: broadcasts.broadcasts.map(b => ({
        id: b.id,
        type: b.type,
        title: b.title,
        content: b.content.substring(0, 100) + '...',
        status: b.status,
        priority: b.priority,
        targetAudience: b.targetAudience,
        createdAt: b.createdAt,
        sentAt: b.sentAt,
        deliveryStats: b.deliveryStats
      }))
    };

    if (format === 'csv') {
      // Convert to CSV format
      const csv = this.convertToCSV(exportData);
      return { format: 'csv', data: csv };
    }

    return { format: 'json', data: exportData };
  }

  /**
   * Convert data to CSV format
   */
  convertToCSV(data) {
    const headers = ['ID', 'Type', 'Title', 'Status', 'Priority', 'Target Audience', 'Created At', 'Sent At', 'Total Sent', 'Total Failed'];
    const rows = data.broadcasts.map(b => [
      b.id,
      b.type,
      b.title,
      b.status,
      b.priority,
      b.targetAudience,
      b.createdAt,
      b.sentAt || '',
      b.deliveryStats?.total || 0,
      b.deliveryStats?.failed || 0
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}

// Export singleton instance
const broadcastService = new BroadcastService();

module.exports = {
  BroadcastService,
  broadcastService
};
