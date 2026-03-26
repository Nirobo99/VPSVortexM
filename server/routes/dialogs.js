const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const { Message, User, BlockedUser } = require('../models');
const authMiddleware = require('../middleware/auth');
const { Op } = require('sequelize');
const redisClient = require('../utils/redis');

/**
 * GET /api/dialogs - Get user's dialog list
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Get all users the current user has had conversations with
    const [sentMessages, receivedMessages] = await Promise.all([
      Message.findAll({
        where: {
          senderId: currentUserId,
          isDeleted: false
        },
        attributes: ['receiverId'],
        group: ['receiverId']
      }),
      Message.findAll({
        where: {
          receiverId: currentUserId,
          isDeleted: false
        },
        attributes: ['senderId'],
        group: ['senderId']
      })
    ]);

    // Combine and deduplicate user IDs
    const conversationUserIds = new Set();
    sentMessages.forEach(msg => conversationUserIds.add(msg.receiverId));
    receivedMessages.forEach(msg => conversationUserIds.add(msg.senderId));

    if (conversationUserIds.size === 0) {
      return res.json({
        dialogs: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalDialogs: 0,
          limit
        }
      });
    }

    // Get last message and unread count for each conversation
    const dialogs = [];
    for (const userId of conversationUserIds) {
      // Check if user is blocked
      const [blockByUser, blockByTarget] = await Promise.all([
        BlockedUser.findOne({
          where: {
            userId: currentUserId,
            blockedUserId: userId
          }
        }),
        BlockedUser.findOne({
          where: {
            userId: userId,
            blockedUserId: currentUserId
          }
        })
      ]);

      if (blockByUser || blockByTarget) {
        continue; // Skip blocked users
      }

      // Get last message
      const lastMessage = await Message.findOne({
        where: {
          [Op.or]: [
            { senderId: currentUserId, receiverId: userId },
            { senderId: userId, receiverId: currentUserId }
          ],
          isDeleted: false
        },
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'name', 'avatar']
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      if (!lastMessage) continue;

      // Get unread count
      const unreadKey = `unread:${currentUserId}:${userId}`;
      const unreadCount = await redisClient.get(unreadKey) || '0';

      // Get other user info
      const otherUser = await User.findByPk(userId, {
        attributes: ['id', 'name', 'avatar', 'isPublic']
      });

      dialogs.push({
        user: otherUser,
        lastMessage,
        unreadCount: parseInt(unreadCount),
        isBlocked: !!(blockByUser || blockByTarget),
        updatedAt: lastMessage.createdAt
      });
    }

    // Sort by last message time
    dialogs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // Apply pagination
    const totalDialogs = dialogs.length;
    const paginatedDialogs = dialogs.slice(offset, offset + limit);

    res.json({
      dialogs: paginatedDialogs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalDialogs / limit),
        totalDialogs,
        limit
      }
    });
  } catch (error) {
    console.error('Get dialogs error:', error);
    res.status(500).json({ error: 'Failed to get dialogs' });
  }
});

/**
 * GET /api/dialogs/:userId/messages - Search messages in specific dialog
 */
router.get('/:userId/messages/search', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const targetUserId = parseInt(req.params.userId);
    const { q: query } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Check block status
    const [blockByUser, blockByTarget] = await Promise.all([
      BlockedUser.findOne({
        where: {
          userId: currentUserId,
          blockedUserId: targetUserId
        }
      }),
      BlockedUser.findOne({
        where: {
          userId: targetUserId,
          blockedUserId: currentUserId
        }
      })
    ]);

    if (blockByUser || blockByTarget) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Search messages
    const { count, rows: messages } = await Message.findAndCountAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId, receiverId: targetUserId },
          { senderId: targetUserId, receiverId: currentUserId }
        ],
        text: {
          [Op.iLike]: `%${query.trim()}%`
        },
        isDeleted: false
      },
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'avatar']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      messages: messages.reverse(),
      query: query.trim(),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalResults: count,
        limit
      }
    });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

/**
 * GET /api/messages/search - Global search across all user's messages
 */
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const { q: query, withUserId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    let whereClause = {
      [Op.or]: [
        { senderId: currentUserId },
        { receiverId: currentUserId }
      ],
      text: {
        [Op.iLike]: `%${query.trim()}%`
      },
      isDeleted: false
    };

    // Filter by specific user if provided
    if (withUserId) {
      const targetUserId = parseInt(withUserId);
      whereClause[Op.and] = {
        [Op.or]: [
          { senderId: currentUserId, receiverId: targetUserId },
          { senderId: targetUserId, receiverId: currentUserId }
        ]
      };
    }

    const { count, rows: messages } = await Message.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'avatar']
        },
        {
          model: User,
          as: 'receiver',
          attributes: ['id', 'name', 'avatar']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      messages: messages.reverse(),
      query: query.trim(),
      withUserId: withUserId ? parseInt(withUserId) : null,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalResults: count,
        limit
      }
    });
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

/**
 * POST /api/dialogs/:userId/read - Mark all messages in dialog as read
 */
router.post('/:userId/read', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const targetUserId = parseInt(req.params.userId);

    // Check block status
    const [blockByUser, blockByTarget] = await Promise.all([
      BlockedUser.findOne({
        where: {
          userId: currentUserId,
          blockedUserId: targetUserId
        }
      }),
      BlockedUser.findOne({
        where: {
          userId: targetUserId,
          blockedUserId: currentUserId
        }
      })
    ]);

    if (blockByUser || blockByTarget) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update all unread messages to read
    await Message.update(
      { status: 'read' },
      {
        where: {
          senderId: targetUserId,
          receiverId: currentUserId,
          status: { [Op.ne]: 'read' },
          isDeleted: false
        }
      }
    );

    // Clear unread counter
    const unreadKey = `unread:${currentUserId}:${targetUserId}`;
    await redisClient.del(unreadKey);

    // Notify sender about read status
    const { getUserSocketId } = require('../socket');
    const senderSocketId = await getUserSocketId(targetUserId);
    if (senderSocketId) {
      const io = require('../socket').initializeSocketIO;
      if (io && io.sockets) {
        const roomName = `chat:${Math.min(currentUserId, targetUserId)}_${Math.max(currentUserId, targetUserId)}`;
        io.to(roomName).emit('messages_read', {
          userId: currentUserId,
          targetUserId,
          timestamp: new Date().toISOString()
        });
      }
    }

    res.json({ message: 'All messages marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

module.exports = router;
