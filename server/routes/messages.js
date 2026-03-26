const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const { Message, Attachment, Reaction, PinnedMessage, User, BlockedUser } = require('../models');
const authMiddleware = require('../middleware/auth');
const { getUserSocketId, isUserOnline } = require('../socket');
const { Op } = require('sequelize');

/**
 * Middleware to check if users are blocked
 */
async function checkBlockStatus(req, res, next) {
  try {
    const currentUserId = req.user.userId;
    const targetUserId = parseInt(req.params.userId) || req.body.receiverId;

    if (!targetUserId || targetUserId === currentUserId) {
      return res.status(400).json({ error: 'Invalid target user' });
    }

    // Check if either user has blocked the other
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

    if (blockByUser) {
      return res.status(403).json({ error: 'You have blocked this user' });
    }

    if (blockByTarget) {
      return res.status(403).json({ error: 'You are blocked by this user' });
    }

    req.targetUserId = targetUserId;
    next();
  } catch (error) {
    console.error('Block status check error:', error);
    res.status(500).json({ error: 'Failed to check block status' });
  }
}

/**
 * GET /api/messages/:userId - Get message history with user
 */
router.get('/:userId', authMiddleware, checkBlockStatus, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const targetUserId = req.targetUserId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { count, rows: messages } = await Message.findAndCountAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId, receiverId: targetUserId },
          { senderId: targetUserId, receiverId: currentUserId }
        ],
        isDeleted: false
      },
      include: [
        {
          model: Attachment,
          as: 'attachments'
        },
        {
          model: Reaction,
          as: 'reactions',
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'avatar']
          }]
        },
        {
          model: Message,
          as: 'replyTo',
          attributes: ['id', 'text', 'senderId']
        },
        {
          model: User,
          as: 'forwardedFrom',
          attributes: ['id', 'name', 'avatar']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    // Get pinned messages for this chat
    const pinnedMessages = await PinnedMessage.findAll({
      where: { userId: currentUserId },
      include: [{
        model: Message,
        as: 'message',
        where: {
          [Op.or]: [
            { senderId: currentUserId, receiverId: targetUserId },
            { senderId: targetUserId, receiverId: currentUserId }
          ]
        },
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'name', 'avatar']
          }
        ]
      }]
    });

    res.json({
      messages: messages.reverse(), // Reverse to show oldest first
      pinnedMessages: pinnedMessages.map(pm => pm.message),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalMessages: count,
        limit
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * POST /api/messages - Send new message
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const { receiverId, text, type = 'text', replyToId, forwardedFromId, attachments } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: 'Receiver ID is required' });
    }

    // Check block status
    const [blockByUser, blockByTarget] = await Promise.all([
      BlockedUser.findOne({
        where: {
          userId: currentUserId,
          blockedUserId: receiverId
        }
      }),
      BlockedUser.findOne({
        where: {
          userId: receiverId,
          blockedUserId: currentUserId
        }
      })
    ]);

    if (blockByUser) {
      return res.status(403).json({ error: 'You have blocked this user' });
    }

    if (blockByTarget) {
      return res.status(403).json({ error: 'You are blocked by this user' });
    }

    // Create message
    const message = await Message.create({
      senderId: currentUserId,
      receiverId,
      text,
      type,
      replyToId,
      forwardedFromId,
      status: 'sent'
    });

    // Create attachments if provided
    if (attachments && attachments.length > 0) {
      const attachmentRecords = attachments.map(att => ({
        messageId: message.id,
        url: att.url,
        type: att.type,
        size: att.size,
        duration: att.duration,
        originalName: att.originalName,
        mimeType: att.mimeType,
        thumbnailUrl: att.thumbnailUrl
      }));
      await Attachment.bulkCreate(attachmentRecords);
    }

    // Get complete message with associations
    const completeMessage = await Message.findByPk(message.id, {
      include: [
        {
          model: Attachment,
          as: 'attachments'
        },
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'avatar']
        }
      ]
    });

    // Update unread counter in Redis
    const redisClient = require('../utils/redis');
    const unreadKey = `unread:${receiverId}:${currentUserId}`;
    const currentCount = await redisClient.get(unreadKey) || '0';
    await redisClient.setEx(unreadKey, 7 * 24 * 60 * 60, (parseInt(currentCount) + 1).toString());

    // Send real-time notification if receiver is online
    const receiverSocketId = await getUserSocketId(receiverId);
    if (receiverSocketId) {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        const roomName = `chat:${Math.min(currentUserId, receiverId)}_${Math.max(currentUserId, receiverId)}`;
        io.to(roomName).emit('new_message', completeMessage);
        
        // Update message status to delivered
        await message.update({ status: 'delivered' });
        completeMessage.status = 'delivered';
      }
    }

    res.status(201).json(completeMessage);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * PUT /api/messages/:id - Edit message
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const messageId = parseInt(req.params.id);
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.senderId !== currentUserId) {
      return res.status(403).json({ error: 'Can only edit your own messages' });
    }

    // Check if message is too old (24 hours)
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    if (messageAge > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Cannot edit messages older than 24 hours' });
    }

    await message.update({
      text: text.trim(),
      isEdited: true
    });

    // Get updated message with associations
    const updatedMessage = await Message.findByPk(messageId, {
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'avatar']
        }
      ]
    });

    // Notify about message update
    const receiverSocketId = await getUserSocketId(message.receiverId);
    if (receiverSocketId) {
      const io = require('../socket').initializeSocketIO;
      if (io && io.sockets) {
        const roomName = `chat:${Math.min(currentUserId, message.receiverId)}_${Math.max(currentUserId, message.receiverId)}`;
        io.to(roomName).emit('message_updated', updatedMessage);
      }
    }

    res.json(updatedMessage);
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

/**
 * DELETE /api/messages/:id - Delete message
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const messageId = parseInt(req.params.id);

    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Only sender or receiver can delete message
    if (message.senderId !== currentUserId && message.receiverId !== currentUserId) {
      return res.status(403).json({ error: 'Cannot delete this message' });
    }

    await message.update({
      isDeleted: true,
      deletedAt: new Date()
    });

    // Notify about message deletion
    const otherUserId = message.senderId === currentUserId ? message.receiverId : message.senderId;
    const receiverSocketId = await getUserSocketId(otherUserId);
    if (receiverSocketId) {
      const io = require('../socket').initializeSocketIO;
      if (io && io.sockets) {
        const roomName = `chat:${Math.min(currentUserId, otherUserId)}_${Math.max(currentUserId, otherUserId)}`;
        io.to(roomName).emit('message_deleted', { messageId });
      }
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

/**
 * POST /api/messages/:id/reactions - Add/remove reaction
 */
router.post('/:id/reactions', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const messageId = parseInt(req.params.id);
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }

    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is part of this conversation
    if (message.senderId !== currentUserId && message.receiverId !== currentUserId) {
      return res.status(403).json({ error: 'Cannot react to this message' });
    }

    // Check if reaction already exists
    const existingReaction = await Reaction.findOne({
      where: {
        messageId,
        userId: currentUserId,
        emoji
      }
    });

    if (existingReaction) {
      // Remove reaction
      await existingReaction.destroy();
      res.json({ action: 'removed', emoji });
    } else {
      // Add reaction
      const reaction = await Reaction.create({
        messageId,
        userId: currentUserId,
        emoji
      });

      const reactionWithUser = await Reaction.findByPk(reaction.id, {
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'avatar']
        }]
      });

      // Notify about reaction
      const otherUserId = message.senderId === currentUserId ? message.receiverId : message.senderId;
      const receiverSocketId = await getUserSocketId(otherUserId);
      if (receiverSocketId) {
        const io = require('../socket').initializeSocketIO;
        if (io && io.sockets) {
          const roomName = `chat:${Math.min(currentUserId, otherUserId)}_${Math.max(currentUserId, otherUserId)}`;
          io.to(roomName).emit('reaction_added', reactionWithUser);
        }
      }

      res.json({ action: 'added', reaction: reactionWithUser });
    }
  } catch (error) {
    console.error('Reaction error:', error);
    res.status(500).json({ error: 'Failed to handle reaction' });
  }
});

/**
 * POST /api/messages/:id/pin - Pin message
 */
router.post('/:id/pin', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const messageId = parseInt(req.params.id);

    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is part of this conversation
    if (message.senderId !== currentUserId && message.receiverId !== currentUserId) {
      return res.status(403).json({ error: 'Cannot pin this message' });
    }

    // Check if already pinned
    const existingPin = await PinnedMessage.findOne({
      where: {
        userId: currentUserId,
        messageId
      }
    });

    if (existingPin) {
      return res.status(400).json({ error: 'Message already pinned' });
    }

    await PinnedMessage.create({
      userId: currentUserId,
      messageId
    });

    res.json({ message: 'Message pinned successfully' });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

/**
 * DELETE /api/messages/:id/pin - Unpin message
 */
router.delete('/:id/pin', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const messageId = parseInt(req.params.id);

    const deletedCount = await PinnedMessage.destroy({
      where: {
        userId: currentUserId,
        messageId
      }
    });

    if (deletedCount === 0) {
      return res.status(404).json({ error: 'Pin not found' });
    }

    res.json({ message: 'Message unpinned successfully' });
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({ error: 'Failed to unpin message' });
  }
});

module.exports = router;
