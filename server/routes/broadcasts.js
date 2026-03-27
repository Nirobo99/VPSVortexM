const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { 
  ChannelBroadcast, 
  BroadcastDelivery, 
  BroadcastReply,
  Channel,
  User 
} = require('../models');
const { broadcastService } = require('../services/broadcastService');
const router = express.Router();

/**
 * POST /api/broadcasts - Create a new broadcast
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { channelId, ...broadcastData } = req.body;
    const userId = req.user.id;

    if (!channelId) {
      return res.status(400).json({ error: 'Channel ID is required' });
    }

    const broadcast = await broadcastService.createBroadcast(channelId, userId, broadcastData);
    
    res.status(201).json({
      success: true,
      broadcast: {
        id: broadcast.id,
        type: broadcast.type,
        title: broadcast.title,
        content: broadcast.content,
        priority: broadcast.priority,
        targetAudience: broadcast.targetAudience,
        deliveryMethod: broadcast.deliveryMethod,
        attachments: broadcast.attachments,
        mentions: broadcast.mentions,
        hashtags: broadcast.hashtags,
        isScheduled: broadcast.isScheduled,
        scheduledAt: broadcast.scheduledAt,
        isRecurring: broadcast.isRecurring,
        status: broadcast.status,
        settings: broadcast.settings,
        createdAt: broadcast.createdAt
      }
    });

  } catch (error) {
    console.error('Create broadcast error:', error);
    if (error.message.includes('permission') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create broadcast' });
  }
});

/**
 * GET /api/broadcasts/channel/:channelId - Get channel broadcasts
 */
router.get('/channel/:channelId', authenticateToken, async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user.id;
    const options = req.query;

    const result = await broadcastService.getChannelBroadcasts(channelId, userId, options);
    res.json(result);

  } catch (error) {
    console.error('Get channel broadcasts error:', error);
    if (error.message.includes('access')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get broadcasts' });
  }
});

/**
 * GET /api/broadcasts/:id - Get broadcast details
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await broadcastService.getBroadcast(id, userId);
    res.json(result);

  } catch (error) {
    console.error('Get broadcast error:', error);
    if (error.message.includes('not found') || error.message.includes('access')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get broadcast' });
  }
});

/**
 * POST /api/broadcasts/:id/send - Send broadcast immediately
 */
router.post('/:id/send', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await broadcastService.sendBroadcast(id);
    res.json({ success: true, deliveryStats: result });

  } catch (error) {
    console.error('Send broadcast error:', error);
    if (error.message.includes('not found') || error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
});

/**
 * POST /api/broadcasts/:id/schedule - Schedule broadcast
 */
router.post('/:id/schedule', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body;
    const userId = req.user.id;

    if (!scheduledAt) {
      return res.status(400).json({ error: 'Scheduled time is required' });
    }

    const broadcast = await broadcastService.scheduleBroadcast(id, scheduledAt);
    res.json({
      success: true,
      broadcast: {
        id: broadcast.id,
        isScheduled: broadcast.isScheduled,
        scheduledAt: broadcast.scheduledAt,
        status: broadcast.status
      }
    });

  } catch (error) {
    console.error('Schedule broadcast error:', error);
    if (error.message.includes('not found') || error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to schedule broadcast' });
  }
});

/**
 * POST /api/broadcasts/:id/cancel - Cancel broadcast
 */
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await broadcastService.cancelBroadcast(id, userId);
    res.json({ success: true });

  } catch (error) {
    console.error('Cancel broadcast error:', error);
    if (error.message.includes('not found') || error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to cancel broadcast' });
  }
});

/**
 * POST /api/broadcasts/:id/replies - Add reply to broadcast
 */
router.post('/:id/replies', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { content, type = 'text', isPublic = true } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Reply content is required' });
    }

    const reply = await broadcastService.addReply(id, userId, {
      content: content.trim(),
      type,
      isPublic
    });

    res.status(201).json({
      success: true,
      reply: {
        id: reply.id,
        content: reply.content,
        type: reply.type,
        isPublic: reply.isPublic,
        createdAt: reply.createdAt
      }
    });

  } catch (error) {
    console.error('Add reply error:', error);
    if (error.message.includes('not found') || error.message.includes('access') || error.message.includes('allowed')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to add reply' });
  }
});

/**
 * GET /api/broadcasts/user/deliveries - Get user's broadcast deliveries
 */
router.get('/user/deliveries', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const options = req.query;

    const result = await broadcastService.getUserDeliveries(userId, options);
    res.json(result);

  } catch (error) {
    console.error('Get user deliveries error:', error);
    res.status(500).json({ error: 'Failed to get deliveries' });
  }
});

/**
 * POST /api/broadcasts/user/mark-read - Mark broadcasts as read
 */
router.post('/user/mark-read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { broadcastId } = req.body;

    const result = await broadcastService.markAsRead(userId, broadcastId);
    res.json(result);

  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

/**
 * GET /api/broadcasts/user/unread-count - Get unread broadcasts count
 */
router.get('/user/unread-count', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const count = await broadcastService.getUnreadCount(userId);
    res.json({ unreadCount: count });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * GET /api/broadcasts/channel/:channelId/stats - Get broadcast statistics
 */
router.get('/channel/:channelId/stats', authenticateToken, async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user.id;

    const stats = await broadcastService.getBroadcastStats(channelId, userId);
    res.json({ stats });

  } catch (error) {
    console.error('Get broadcast stats error:', error);
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get broadcast statistics' });
  }
});

/**
 * POST /api/broadcasts/recurring - Create recurring broadcast
 */
router.post('/recurring', authenticateToken, async (req, res) => {
  try {
    const { channelId, ...broadcastData } = req.body;
    const userId = req.user.id;

    if (!channelId) {
      return res.status(400).json({ error: 'Channel ID is required' });
    }

    const broadcast = await broadcastService.createRecurringBroadcast(channelId, userId, broadcastData);
    
    res.status(201).json({
      success: true,
      broadcast: {
        id: broadcast.id,
        type: broadcast.type,
        content: broadcast.content,
        targetAudience: broadcast.targetAudience,
        isRecurring: broadcast.isRecurring,
        recurrencePattern: broadcast.recurrencePattern,
        status: broadcast.status
      }
    });

  } catch (error) {
    console.error('Create recurring broadcast error:', error);
    if (error.message.includes('permission') || error.message.includes('required')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create recurring broadcast' });
  }
});

/**
 * GET /api/broadcasts/channel/:channelId/templates - Get broadcast templates
 */
router.get('/channel/:channelId/templates', authenticateToken, async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user.id;

    const result = await broadcastService.getBroadcastTemplates(channelId, userId);
    res.json(result);

  } catch (error) {
    console.error('Get broadcast templates error:', error);
    if (error.message.includes('access')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get broadcast templates' });
  }
});

/**
 * POST /api/broadcasts/test - Send test broadcast
 */
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const { channelId, content, deliveryMethod } = req.body;
    const userId = req.user.id;

    if (!channelId) {
      return res.status(400).json({ error: 'Channel ID is required' });
    }

    const broadcast = await broadcastService.sendTestBroadcast(channelId, userId, {
      content,
      deliveryMethod
    });

    res.json({
      success: true,
      broadcast: {
        id: broadcast.id,
        content: broadcast.content,
        status: broadcast.status,
        createdAt: broadcast.createdAt
      }
    });

  } catch (error) {
    console.error('Send test broadcast error:', error);
    if (error.message.includes('permission') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to send test broadcast' });
  }
});

/**
 * POST /api/broadcasts/:id/retry - Retry failed deliveries
 */
router.post('/:id/retry', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { maxRetries = 3 } = req.body;
    const userId = req.user.id;

    // Check if user can manage this broadcast
    const broadcast = await ChannelBroadcast.findByPk(id);
    if (!broadcast) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    const canSend = await broadcastService.canSendBroadcast(broadcast.channelId, userId);
    if (!canSend) {
      return res.status(403).json({ error: 'You do not have permission to manage this broadcast' });
    }

    const retriedCount = await broadcastService.retryFailedDeliveries(id, maxRetries);
    res.json({ success: true, retriedCount });

  } catch (error) {
    console.error('Retry deliveries error:', error);
    res.status(500).json({ error: 'Failed to retry deliveries' });
  }
});

/**
 * GET /api/broadcasts/channel/:channelId/export - Export broadcast statistics
 */
router.get('/channel/:channelId/export', authenticateToken, async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user.id;
    const { format = 'json' } = req.query;

    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Use json or csv' });
    }

    const result = await broadcastService.exportBroadcastStats(channelId, userId, format);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="broadcast_stats_${channelId}.csv"`);
      res.send(result.data);
    } else {
      res.json(result);
    }

  } catch (error) {
    console.error('Export broadcast stats error:', error);
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to export broadcast statistics' });
  }
});

module.exports = router;
