const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { User, BlockedUser, Call, CallParticipant, CallRecording } = require('../models');
const { livekitManager } = require('../utils/livekit');
const { recordingService } = require('../services/recordingService');
const redisClient = require('../utils/redis');
const router = express.Router();

/**
 * Middleware to check if users can call each other
 */
async function checkCallPermission(req, res, next) {
  try {
    const { targetId, conversationId } = req.body;
    const initiatorId = req.user.id;

    // For direct calls - check block status
    if (targetId) {
      const isBlocked = await BlockedUser.findOne({
        where: {
          [require('sequelize').Op.or]: [
            { blockerId: initiatorId, blockedId: targetId },
            { blockerId: targetId, blockedId: initiatorId }
          ]
        }
      });

      if (isBlocked) {
        return res.status(403).json({ error: 'Cannot call this user' });
      }
    }

    // For group calls - check conversation membership (will be implemented later)
    if (conversationId) {
      // TODO: Check if user is member of conversation
      // For now, allow all group calls
    }

    next();
  } catch (error) {
    console.error('Call permission check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/calls/start - Initiate a call
 */
router.post('/start', authenticateToken, checkCallPermission, async (req, res) => {
  try {
    const { targetId, conversationId, type = 'video' } = req.body;
    const initiatorId = req.user.id;

    // Validate call type
    if (!['audio', 'video'].includes(type)) {
      return res.status(400).json({ error: 'Invalid call type' });
    }

    // Check if user already has active calls
    const activeCalls = await Call.findActiveCallsForUser(initiatorId);
    if (activeCalls.length > 0) {
      return res.status(409).json({ error: 'User already in active call' });
    }

    // Generate room name
    const roomName = livekitManager.generateRoomName(type, initiatorId);

    // Create call record
    const call = await Call.create({
      roomName,
      initiatorId,
      type,
      isGroup: !!conversationId,
      targetId: targetId || null,
      conversationId: conversationId || null,
      status: 'pending',
      recordingEnabled: false // Will be updated later
    });

    // Add initiator as participant
    await CallParticipant.addParticipant(call.id, initiatorId, {
      participantName: req.user.name
    });

    // Generate LiveKit token for initiator
    const token = livekitManager.generateToken(roomName, initiatorId.toString(), {
      canPublish: true,
      canSubscribe: true,
      metadata: {
        userId: initiatorId,
        userName: req.user.name,
        isInitiator: true
      }
    });

    // Create LiveKit room (optional)
    try {
      await livekitManager.createRoom(roomName, {
        maxParticipants: conversationId ? 500 : 2,
        recordings: false
      });
    } catch (roomError) {
      console.warn('Failed to create LiveKit room:', roomError.message);
    }

    // Emit incoming call event via Socket.IO
    const io = require('../socket').io;
    
    if (targetId) {
      // Direct call - notify target user
      const targetSocketId = await redis.get(`user_socket:${targetId}`);
      if (targetSocketId) {
        io.to(targetSocketId).emit('incoming_call', {
          callId: call.id,
          roomName,
          type,
          initiator: {
            id: initiatorId,
            name: req.user.name,
            avatar: req.user.avatar
          }
        });
      }
    } else if (conversationId) {
      // Group call - notify all conversation members (except initiator)
      // TODO: Get conversation members and notify them
      console.log('Group call notification to be implemented');
    }

    res.json({
      success: true,
      call: {
        id: call.id,
        roomName,
        type,
        isGroup: call.isGroup,
        status: call.status,
        token,
        livekitUrl: livekitManager.host
      }
    });

  } catch (error) {
    console.error('Start call error:', error);
    res.status(500).json({ error: 'Failed to start call' });
  }
});

/**
 * POST /api/calls/:callId/accept - Accept a call
 */
router.post('/:callId/accept', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.id;

    const call = await Call.findByPk(callId, {
      include: [
        { model: User, as: 'initiator' },
        { model: User, as: 'target' }
      ]
    });

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    if (call.status !== 'pending') {
      return res.status(400).json({ error: 'Call cannot be accepted' });
    }

    // Check if user is target or participant
    if (call.targetId !== userId && !call.isGroup) {
      return res.status(403).json({ error: 'Not authorized to accept this call' });
    }

    // Update call status
    call.status = 'active';
    call.startedAt = new Date();
    await call.save();

    // Add user as participant
    await CallParticipant.addParticipant(call.id, userId, {
      participantName: req.user.name
    });

    // Generate token for participant
    const token = livekitManager.generateToken(call.roomName, userId.toString(), {
      canPublish: true,
      canSubscribe: true,
      metadata: {
        userId: userId,
        userName: req.user.name,
        isInitiator: false
      }
    });

    // Notify initiator via Socket.IO
    const io = require('../socket').io;
    const initiatorSocketId = await redis.get(`user_socket:${call.initiatorId}`);
    if (initiatorSocketId) {
      io.to(initiatorSocketId).emit('call_accepted', {
        callId: call.id,
        participant: {
          id: userId,
          name: req.user.name,
          avatar: req.user.avatar
        }
      });
    }

    res.json({
      success: true,
      call: {
        id: call.id,
        roomName: call.roomName,
        type: call.type,
        status: call.status,
        token,
        livekitUrl: livekitManager.host
      }
    });

  } catch (error) {
    console.error('Accept call error:', error);
    res.status(500).json({ error: 'Failed to accept call' });
  }
});

/**
 * POST /api/calls/:callId/reject - Reject a call
 */
router.post('/:callId/reject', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.id;

    const call = await Call.findByPk(callId);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    if (call.status !== 'pending') {
      return res.status(400).json({ error: 'Call cannot be rejected' });
    }

    // Check if user is target or participant
    if (call.targetId !== userId && !call.isGroup) {
      return res.status(403).json({ error: 'Not authorized to reject this call' });
    }

    // Update call status
    call.status = 'missed';
    call.endedAt = new Date();
    await call.save();

    // Remove participant
    await CallParticipant.removeParticipant(call.id, userId);

    // Notify initiator via Socket.IO
    const io = require('../socket').io;
    const initiatorSocketId = await redis.get(`user_socket:${call.initiatorId}`);
    if (initiatorSocketId) {
      io.to(initiatorSocketId).emit('call_rejected', {
        callId: call.id,
        rejectedBy: {
          id: userId,
          name: req.user.name
        }
      });
    }

    // Clean up LiveKit room
    try {
      await livekitManager.deleteRoom(call.roomName);
    } catch (error) {
      console.warn('Failed to delete LiveKit room:', error.message);
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Reject call error:', error);
    res.status(500).json({ error: 'Failed to reject call' });
  }
});

/**
 * POST /api/calls/:callId/end - End a call
 */
router.post('/:callId/end', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.id;

    const call = await Call.findByPk(callId, {
      include: [
        { model: CallParticipant, as: 'participants' }
      ]
    });

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    if (call.status === 'ended') {
      return res.status(400).json({ error: 'Call already ended' });
    }

    // Check if user is participant
    const isParticipant = call.participants.some(p => p.userId === userId && !p.leftAt);
    if (!isParticipant && call.initiatorId !== userId) {
      return res.status(403).json({ error: 'Not a participant in this call' });
    }

    // Update call status
    call.status = 'ended';
    call.endedAt = new Date();
    await call.save();

    // Remove participant
    await CallParticipant.removeParticipant(call.id, userId);

    // Stop recording if enabled
    if (call.recordingEnabled) {
      try {
        await livekitManager.stopRecording(call.roomName);
      } catch (error) {
        console.warn('Failed to stop recording:', error.message);
      }
    }

    // Notify all participants via Socket.IO
    const io = require('../socket').io;
    for (const participant of call.participants) {
      if (participant.userId !== userId && !participant.leftAt) {
        const socketId = await redis.get(`user_socket:${participant.userId}`);
        if (socketId) {
          io.to(socketId).emit('call_ended', {
            callId: call.id,
            endedBy: {
              id: userId,
              name: req.user.name
            }
          });
        }
      }
    }

    // Clean up LiveKit room if no participants left
    const activeParticipants = await CallParticipant.getActiveParticipants(call.id);
    if (activeParticipants.length === 0) {
      try {
        await livekitManager.deleteRoom(call.roomName);
      } catch (error) {
        console.warn('Failed to delete LiveKit room:', error.message);
      }
    }

    res.json({ success: true });

  } catch (error) {
    console.error('End call error:', error);
    res.status(500).json({ error: 'Failed to end call' });
  }
});

/**
 * GET /api/calls/history - Get call history
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type } = req.query;

    const result = await Call.findCallHistory(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      type
    });

    res.json(result);

  } catch (error) {
    console.error('Call history error:', error);
    res.status(500).json({ error: 'Failed to get call history' });
  }
});

/**
 * GET /api/calls/:callId - Get call details
 */
router.get('/:callId', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.id;

    const call = await Call.findByPk(callId, {
      include: [
        { model: User, as: 'initiator', attributes: ['id', 'name', 'avatar'] },
        { model: User, as: 'target', attributes: ['id', 'name', 'avatar'] },
        { 
          model: CallParticipant, 
          as: 'participants',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }]
        },
        {
          model: CallRecording,
          as: 'recordings'
        }
      ]
    });

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Check if user is participant
    const isParticipant = call.initiatorId === userId || 
                         call.targetId === userId ||
                         call.participants.some(p => p.userId === userId);

    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to view this call' });
    }

    res.json({ call });

  } catch (error) {
    console.error('Get call error:', error);
    res.status(500).json({ error: 'Failed to get call details' });
  }
});

/**
 * POST /api/calls/:callId/participant/state - Update participant state
 */
router.post('/:callId/participant/state', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.id;
    const { isMuted, isVideoOff, isScreenSharing } = req.body;

    const call = await Call.findByPk(callId);
    if (!call || call.status !== 'active') {
      return res.status(404).json({ error: 'Call not found or not active' });
    }

    // Update participant state
    const participant = await CallParticipant.updateParticipantState(callId, userId, {
      isMuted,
      isVideoOff,
      isScreenSharing
    });

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    // Notify other participants via Socket.IO
    const io = require('../socket').io;
    const activeParticipants = await CallParticipant.getActiveParticipants(callId);
    
    for (const activeParticipant of activeParticipants) {
      if (activeParticipant.userId !== userId) {
        const socketId = await redis.get(`user_socket:${activeParticipant.userId}`);
        if (socketId) {
          io.to(socketId).emit('participant_state_changed', {
            callId,
            participant: {
              id: userId,
              isMuted,
              isVideoOff,
              isScreenSharing
            }
          });
        }
      }
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Update participant state error:', error);
    res.status(500).json({ error: 'Failed to update participant state' });
  }
});

/**
 * POST /api/calls/:callId/recording/start - Start recording
 */
router.post('/:callId/recording/start', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.id;

    const call = await Call.findByPk(callId);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Check if user can record this call
    const canRecord = await recordingService.canRecordCall(callId, userId);
    if (!canRecord.allowed) {
      return res.status(403).json({ error: canRecord.reason });
    }

    // Start recording
    const result = await recordingService.startRecording(callId, call.roomName);

    // Notify participants that recording has started
    const io = require('../socket').io;
    const activeParticipants = await CallParticipant.getActiveParticipants(callId);
    
    for (const participant of activeParticipants) {
      const socketId = await redis.get(`user_socket:${participant.userId}`);
      if (socketId) {
        io.to(socketId).emit('recording_started', {
          callId,
          recordingId: result.recording.id
        });
      }
    }

    res.json(result);

  } catch (error) {
    console.error('Start recording error:', error);
    res.status(500).json({ error: 'Failed to start recording' });
  }
});

/**
 * POST /api/calls/:callId/recording/stop - Stop recording
 */
router.post('/:callId/recording/stop', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.id;

    const call = await Call.findByPk(callId);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Only initiator can stop recording (for now)
    if (call.initiatorId !== userId) {
      return res.status(403).json({ error: 'Only call initiator can stop recording' });
    }

    // Stop recording
    const result = await recordingService.stopRecording(callId, call.roomName);

    // Notify participants that recording has stopped
    const io = require('../socket').io;
    const activeParticipants = await CallParticipant.getActiveParticipants(callId);
    
    for (const participant of activeParticipants) {
      const socketId = await redis.get(`user_socket:${participant.userId}`);
      if (socketId) {
        io.to(socketId).emit('recording_stopped', {
          callId,
          recording: result.recording
        });
      }
    }

    res.json(result);

  } catch (error) {
    console.error('Stop recording error:', error);
    res.status(500).json({ error: 'Failed to stop recording' });
  }
});

/**
 * GET /api/calls/:callId/recording/status - Get recording status
 */
router.get('/:callId/recording/status', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.id;

    const call = await Call.findByPk(callId);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Check if user is participant
    const isParticipant = call.initiatorId === userId || 
                         call.targetId === userId;

    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to view this call' });
    }

    const status = await recordingService.getRecordingStatus(callId);
    res.json(status);

  } catch (error) {
    console.error('Get recording status error:', error);
    res.status(500).json({ error: 'Failed to get recording status' });
  }
});

/**
 * GET /api/calls/recordings - Get user's recordings
 */
router.get('/recordings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const result = await recordingService.getUserRecordings(userId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json(result);

  } catch (error) {
    console.error('Get recordings error:', error);
    res.status(500).json({ error: 'Failed to get recordings' });
  }
});

/**
 * DELETE /api/calls/recordings/:recordingId - Delete recording
 */
router.delete('/recordings/:recordingId', authenticateToken, async (req, res) => {
  try {
    const { recordingId } = req.params;
    const userId = req.user.id;

    const recording = await CallRecording.findByPk(recordingId, {
      include: [{
        model: Call,
        as: 'call'
      }]
    });

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Check if user owns this recording
    const isOwner = recording.call.initiatorId === userId || 
                   recording.call.targetId === userId;

    if (!isOwner) {
      return res.status(403).json({ error: 'Not authorized to delete this recording' });
    }

    await recordingService.deleteRecording(recordingId);
    res.json({ success: true });

  } catch (error) {
    console.error('Delete recording error:', error);
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

module.exports = router;
