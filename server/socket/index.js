const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const redisClient = require('../utils/redis');
const { getIPInfo } = require('../utils/ipHelper');

// Store io instance globally for access in routes
let ioInstance = null;

/**
 * Initialize Socket.IO server with VPN support and JWT authentication
 */
function initializeSocketIO(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling'], // Support VPN/proxy connections
    allowEIO3: true // Support older Socket.IO clients
  });

  // Store io instance globally
  ioInstance = io;

  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      socket.userRole = decoded.role;
      
      // Store IP information for logging
      socket.ipInfo = getIPInfo(socket.handshake);
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Invalid authentication token'));
    }
  });

  // Handle connection
  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.userId} (${socket.userEmail})`, {
      socketId: socket.id,
      ipInfo: socket.ipInfo,
      timestamp: new Date().toISOString()
    });

    try {
      // Store socket mapping in Redis for scalability
      await redisClient.setEx(`socket:${socket.userId}`, 24 * 60 * 60, socket.id);
      await redisClient.setEx(`user:${socket.userId}:online`, 24 * 60 * 60, 'true');
      
      // Join user to their personal room for direct messages
      socket.join(`user:${socket.userId}`);
      
      // Notify others that this user is online
      socket.broadcast.emit('user_online', { userId: socket.userId });
      
    } catch (error) {
      console.error('Error storing socket mapping:', error);
    }

    // Handle joining chat rooms (for private messages)
    socket.on('join_chat', async (data) => {
      try {
        const { userId } = data;
        if (!userId || userId === socket.userId) return;
        
        const roomName = `chat:${Math.min(socket.userId, userId)}_${Math.max(socket.userId, userId)}`;
        socket.join(roomName);
        
        console.log(`User ${socket.userId} joined chat room with ${userId}`);
      } catch (error) {
        console.error('Error joining chat room:', error);
      }
    });

    // Handle leaving chat rooms
    socket.on('leave_chat', async (data) => {
      try {
        const { userId } = data;
        if (!userId) return;
        
        const roomName = `chat:${Math.min(socket.userId, userId)}_${Math.max(socket.userId, userId)}`;
        socket.leave(roomName);
        
        console.log(`User ${socket.userId} left chat room with ${userId}`);
      } catch (error) {
        console.error('Error leaving chat room:', error);
      }
    });

    // Handle marking messages as read
    socket.on('mark_read', async (data) => {
      try {
        const { userId, messageId } = data;
        if (!userId || !messageId) return;
        
        // Update message status in database
        const { Message } = require('../models');
        await Message.update(
          { status: 'read' },
          {
            where: {
              id: messageId,
              receiverId: socket.userId,
              senderId: userId
            }
          }
        );
        
        // Clear unread counter
        const unreadKey = `unread:${socket.userId}:${userId}`;
        await redisClient.del(unreadKey);
        
        // Notify sender that message was read
        const roomName = `chat:${Math.min(socket.userId, userId)}_${Math.max(socket.userId, userId)}`;
        socket.to(roomName).emit('message_read', {
          messageId,
          readBy: socket.userId,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    });

    // Handle marking all messages in dialog as read
    socket.on('mark_dialog_read', async (data) => {
      try {
        const { userId } = data;
        if (!userId) return;
        
        // Update all unread messages to read
        const { Message } = require('../models');
        const { Op } = require('sequelize');
        
        await Message.update(
          { status: 'read' },
          {
            where: {
              senderId: userId,
              receiverId: socket.userId,
              status: { [Op.ne]: 'read' },
              isDeleted: false
            }
          }
        );
        
        // Clear unread counter
        const unreadKey = `unread:${socket.userId}:${userId}`;
        await redisClient.del(unreadKey);
        
        // Notify sender about read status
        const roomName = `chat:${Math.min(socket.userId, userId)}_${Math.max(socket.userId, userId)}`;
        socket.to(roomName).emit('messages_read', {
          userId: socket.userId,
          targetUserId: userId,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Error marking dialog as read:', error);
      }
    });

    // Handle typing indicators
    socket.on('typing', async (data) => {
      try {
        const { userId } = data;
        if (!userId) return;
        
        const roomName = `chat:${Math.min(socket.userId, userId)}_${Math.max(socket.userId, userId)}`;
        socket.to(roomName).emit('user_typing', {
          userId: socket.userId,
          isTyping: true
        });
      } catch (error) {
        console.error('Error handling typing indicator:', error);
      }
    });

    socket.on('stop_typing', async (data) => {
      try {
        const { userId } = data;
        if (!userId) return;
        
        const roomName = `chat:${Math.min(socket.userId, userId)}_${Math.max(socket.userId, userId)}`;
        socket.to(roomName).emit('user_typing', {
          userId: socket.userId,
          isTyping: false
        });
      } catch (error) {
        console.error('Error handling stop typing:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      console.log(`User disconnected: ${socket.userId} (${socket.userEmail})`, {
        socketId: socket.id,
        reason,
        timestamp: new Date().toISOString()
      });

      try {
        // Remove socket mapping from Redis
        await redisClient.del(`socket:${socket.userId}`);
        await redisClient.del(`user:${socket.userId}:online`);
        
        // Notify others that this user is offline
        socket.broadcast.emit('user_offline', { userId: socket.userId });
        
      } catch (error) {
        console.error('Error cleaning up socket mapping:', error);
      }
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`Socket error for user ${socket.userId}:`, error);
    });
  });

  return io;
}

/**
 * Get socket ID for a user from Redis
 */
async function getUserSocketId(userId) {
  try {
    return await redisClient.get(`socket:${userId}`);
  } catch (error) {
    console.error('Error getting user socket ID:', error);
    return null;
  }
}

/**
 * Check if user is online
 */
async function isUserOnline(userId) {
  try {
    const online = await redisClient.get(`user:${userId}:online`);
    return online === 'true';
  } catch (error) {
    console.error('Error checking user online status:', error);
    return false;
  }
}

/**
 * Get global io instance (for use in routes)
 */
function getIO() {
  return ioInstance;
}

module.exports = {
  initializeSocketIO,
  getUserSocketId,
  isUserOnline,
  getIO
};
