const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { 
  Channel, 
  ChannelMember, 
  ChannelBan, 
  User, 
  Post,
  Product,
  Poll,
  Event 
} = require('../models');
const { channelPrivacyService } = require('../services/channelPrivacyService');
const { channelAdminService } = require('../services/channelAdminService');
const router = express.Router();

/**
 * POST /api/channels - Create a new channel
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      username,
      description,
      type = 'public',
      category,
      tags,
      settings
    } = req.body;

    const userId = req.user.id;

    // Validate input
    if (!name || name.trim().length < 3) {
      return res.status(400).json({ error: 'Channel name must be at least 3 characters long' });
    }

    // Check username uniqueness if provided
    if (username) {
      const existingChannel = await Channel.findOne({ where: { username } });
      if (existingChannel) {
        return res.status(409).json({ error: 'Username is already taken' });
      }
    }

    // Create channel
    const channel = await Channel.create({
      name: name.trim(),
      username: username?.trim() || null,
      description: description?.trim() || null,
      type,
      ownerId: userId,
      category: category?.trim() || null,
      tags: tags || [],
      settings: settings || {}
    });

    // Add owner as member
    await ChannelMember.addMember(channel.id, userId, {
      role: 'owner'
    });

    // Update member count
    await channel.updateMemberCount();

    // Emit Socket.IO event
    const io = require('../socket').io;
    io.emit('channel_created', {
      channel: {
        id: channel.id,
        name: channel.name,
        username: channel.username,
        type: channel.type,
        owner: {
          id: userId,
          name: req.user.name,
          avatar: req.user.avatar
        }
      }
    });

    res.status(201).json({
      success: true,
      channel: {
        id: channel.id,
        name: channel.name,
        username: channel.username,
        description: channel.description,
        type: channel.type,
        category: channel.category,
        tags: channel.tags,
        memberCount: channel.memberCount,
        inviteLink: channel.inviteLink,
        createdAt: channel.createdAt
      }
    });

  } catch (error) {
    console.error('Create channel error:', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

/**
 * GET /api/channels - Get public channels with pagination and filtering
 */
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category = null,
      search = null,
      sortBy = 'memberCount',
      sortOrder = 'DESC'
    } = req.query;

    const result = await Channel.findPublicChannels({
      page: parseInt(page),
      limit: parseInt(limit),
      category,
      search,
      sortBy,
      sortOrder
    });

    res.json(result);

  } catch (error) {
    console.error('Get channels error:', error);
    res.status(500).json({ error: 'Failed to get channels' });
  }
});

/**
 * GET /api/channels/trending - Get trending channels
 */
router.get('/trending', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const channels = await Channel.getTrendingChannels(parseInt(limit));

    res.json({
      channels: channels.map(channel => ({
        id: channel.id,
        name: channel.name,
        username: channel.username,
        description: channel.description,
        avatar: channel.avatar,
        memberCount: channel.memberCount,
        postCount: channel.postCount,
        isVerified: channel.isVerified,
        category: channel.category,
        owner: channel.owner
      }))
    });

  } catch (error) {
    console.error('Get trending channels error:', error);
    res.status(500).json({ error: 'Failed to get trending channels' });
  }
});

/**
 * GET /api/channels/user - Get user's channels
 */
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type = null } = req.query;

    const result = await Channel.findUserChannels(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      type
    });

    res.json(result);

  } catch (error) {
    console.error('Get user channels error:', error);
    res.status(500).json({ error: 'Failed to get user channels' });
  }
});

/**
 * GET /api/channels/:id - Get channel details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const channel = await Channel.findByPk(id, {
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ]
    });

    if (!channel || !channel.isActive) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check privacy for private channels
    if (channel.type === 'private') {
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const isMember = await channel.isMember(userId);
      if (!isMember) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get member status if authenticated
    let memberStatus = null;
    if (userId) {
      const member = await ChannelMember.findOne({
        where: {
          channelId: channel.id,
          userId,
          isActive: true
        }
      });

      if (member) {
        memberStatus = {
          role: member.role,
          joinedAt: member.joinedAt,
          canPost: await channel.canPost(userId),
          canComment: member.canComment,
          canInvite: member.canInvite
        };
      }
    }

    res.json({
      channel: {
        id: channel.id,
        name: channel.name,
        username: channel.username,
        description: channel.description,
        avatar: channel.avatar,
        type: channel.type,
        category: channel.category,
        tags: channel.tags,
        memberCount: channel.memberCount,
        postCount: channel.postCount,
        isVerified: channel.isVerified,
        allowInvites: channel.allowInvites,
        requireApproval: channel.requireApproval,
        allowPosting: channel.allowPosting,
        allowComments: channel.allowComments,
        createdAt: channel.createdAt,
        lastActivityAt: channel.lastActivityAt,
        owner: channel.owner,
        memberStatus
      }
    });

  } catch (error) {
    console.error('Get channel error:', error);
    res.status(500).json({ error: 'Failed to get channel' });
  }
});

/**
 * GET /api/channels/username/:username - Get channel by username
 */
router.get('/username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const userId = req.user?.id;

    const channel = await Channel.findByUsername(username);

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Reuse the existing channel detail logic
    req.params.id = channel.id;
    return await require('./channels').getById(req, res);

  } catch (error) {
    console.error('Get channel by username error:', error);
    res.status(500).json({ error: 'Failed to get channel' });
  }
});

/**
 * PUT /api/channels/:id - Update channel
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    const channel = await Channel.findByPk(id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check if user is owner or admin
    const isAdmin = await channel.isAdmin(userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only channel admins can update channel' });
    }

    // Validate username uniqueness if being updated
    if (updates.username && updates.username !== channel.username) {
      const existingChannel = await Channel.findOne({ 
        where: { username: updates.username } 
      });
      if (existingChannel) {
        return res.status(409).json({ error: 'Username is already taken' });
      }
    }

    // Restrict certain fields to owner only
    const ownerOnlyFields = ['ownerId', 'type'];
    const isOwner = channel.ownerId === userId;
    
    if (!isOwner) {
      ownerOnlyFields.forEach(field => {
        delete updates[field];
      });
    }

    // Update channel
    await channel.update(updates);

    // Emit Socket.IO event
    const io = require('../socket').io;
    io.emit('channel_updated', {
      channelId: channel.id,
      updates: {
        name: channel.name,
        username: channel.username,
        description: channel.description,
        avatar: channel.avatar,
        category: channel.category,
        tags: channel.tags
      }
    });

    res.json({
      success: true,
      channel: {
        id: channel.id,
        name: channel.name,
        username: channel.username,
        description: channel.description,
        avatar: channel.avatar,
        type: channel.type,
        category: channel.category,
        tags: channel.tags,
        allowInvites: channel.allowInvites,
        requireApproval: channel.requireApproval,
        allowPosting: channel.allowPosting,
        allowComments: channel.allowComments,
        updatedAt: channel.updatedAt
      }
    });

  } catch (error) {
    console.error('Update channel error:', error);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

/**
 * DELETE /api/channels/:id - Delete channel
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const channel = await Channel.findByPk(id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Only owner can delete channel
    if (channel.ownerId !== userId) {
      return res.status(403).json({ error: 'Only channel owner can delete channel' });
    }

    // Archive channel instead of hard delete
    channel.isArchived = true;
    channel.archivedAt = new Date();
    await channel.save();

    // Remove all active members
    await ChannelMember.update(
      { isActive: false, leftAt: new Date() },
      { where: { channelId: id, isActive: true } }
    );

    // Emit Socket.IO event
    const io = require('../socket').io;
    io.emit('channel_deleted', {
      channelId: channel.id,
      name: channel.name
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Delete channel error:', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

/**
 * POST /api/channels/:id/join - Join a channel
 */
router.post('/:id/join', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const channel = await Channel.findByPk(id);
    if (!channel || !channel.isActive) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check if user is already a member
    const isMember = await channel.isMember(userId);
    if (isMember) {
      return res.status(409).json({ error: 'Already a member of this channel' });
    }

    // Check if user is banned
    const isBanned = await ChannelBan.isBanned(id, userId);
    if (isBanned) {
      return res.status(403).json({ error: 'You are banned from this channel' });
    }

    // Handle approval requirement
    if (channel.requireApproval) {
      // Create pending membership
      const [member] = await ChannelMember.addMember(id, userId, {
        role: 'member'
      });

      // Notify admins
      const io = require('../socket').io;
      const admins = await ChannelMember.getAdmins(id);
      
      for (const admin of admins) {
        const socketId = await redis.get(`user_socket:${admin.userId}`);
        if (socketId) {
          io.to(socketId).emit('membership_request', {
            channelId: channel.id,
            channelName: channel.name,
            user: {
              id: userId,
              name: req.user.name,
              avatar: req.user.avatar
            }
          });
        }
      }

      return res.json({
        success: true,
        status: 'pending',
        message: 'Membership request sent. Waiting for approval.'
      });
    }

    // Add member directly
    const [member] = await ChannelMember.addMember(id, userId, {
      role: 'member'
    });

    // Update member count
    await channel.updateMemberCount();

    // Emit Socket.IO event
    const io = require('../socket').io;
    io.emit('channel_member_joined', {
      channelId: channel.id,
      member: {
        id: userId,
        name: req.user.name,
        avatar: req.user.avatar
      }
    });

    res.json({
      success: true,
      status: 'joined',
      member: {
        id: member.id,
        role: member.role,
        joinedAt: member.joinedAt
      }
    });

  } catch (error) {
    console.error('Join channel error:', error);
    res.status(500).json({ error: 'Failed to join channel' });
  }
});

/**
 * POST /api/channels/:id/leave - Leave a channel
 */
router.post('/:id/leave', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const channel = await Channel.findByPk(id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Owner cannot leave their own channel (must transfer ownership first)
    if (channel.ownerId === userId) {
      return res.status(403).json({ error: 'Channel owner cannot leave channel' });
    }

    // Remove member
    await ChannelMember.removeMember(id, userId);

    // Update member count
    await channel.updateMemberCount();

    // Emit Socket.IO event
    const io = require('../socket').io;
    io.emit('channel_member_left', {
      channelId: channel.id,
      userId
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Leave channel error:', error);
    res.status(500).json({ error: 'Failed to leave channel' });
  }
});

/**
 * GET /api/channels/:id/members - Get channel members
 */
router.get('/:id/members', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 50, role = null } = req.query;

    // Check if user is member (for private channels)
    const channel = await Channel.findByPk(id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    if (channel.type === 'private') {
      const isMember = await channel.isMember(userId);
      if (!isMember) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const members = await ChannelMember.getActiveMembers(id, {
      page: parseInt(page),
      limit: parseInt(limit),
      role
    });

    res.json({
      members: members.map(member => ({
        id: member.id,
        user: member.user,
        role: member.role,
        joinedAt: member.joinedAt,
        canPost: member.canPost,
        canComment: member.canComment,
        canInvite: member.canInvite
      }))
    });

  } catch (error) {
    console.error('Get channel members error:', error);
    res.status(500).json({ error: 'Failed to get channel members' });
  }
});

/**
 * POST /api/channels/join/:inviteCode - Join channel by invite code
 */
router.post('/join/:inviteCode', authenticateToken, async (req, res) => {
  try {
    const { inviteCode } = req.params;
    const userId = req.user.id;

    const channel = await Channel.findByInviteCode(inviteCode);
    if (!channel) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    // Reuse join logic
    req.params.id = channel.id;
    return await require('./channels').joinChannel(req, res);

  } catch (error) {
    console.error('Join by invite code error:', error);
    res.status(500).json({ error: 'Failed to join channel' });
  }
});

/**
 * POST /api/channels/:id/invite - Generate new invite link
 */
router.post('/:id/invite', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const channel = await Channel.findByPk(id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check if user can invite
    const canInvite = await channel.canPost(userId); // Simplified permission check
    if (!canInvite) {
      return res.status(403).json({ error: 'Cannot invite users to this channel' });
    }

    // Generate new invite link
    const inviteLink = channel.generateInviteLink();
    await channel.save();

    res.json({
      success: true,
      inviteLink: channel.inviteLink,
      inviteCode: channel.inviteCode
    });

  } catch (error) {
    console.error('Generate invite link error:', error);
    res.status(500).json({ error: 'Failed to generate invite link' });
  }
});

/**
 * GET /api/channels/:id/privacy - Get channel privacy settings
 */
router.get('/:id/privacy', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const privacyInfo = await channelPrivacyService.getPrivacyInfo(id, userId);
    res.json({ privacy: privacyInfo });

  } catch (error) {
    console.error('Get privacy settings error:', error);
    res.status(500).json({ error: 'Failed to get privacy settings' });
  }
});

/**
 * PUT /api/channels/:id/privacy - Update channel privacy settings
 */
router.put('/:id/privacy', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const settings = req.body;

    const updates = await channelPrivacyService.updatePrivacySettings(id, settings, userId);
    res.json({ success: true, updates });

  } catch (error) {
    console.error('Update privacy settings error:', error);
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

/**
 * PUT /api/channels/:id/privacy/type - Change channel privacy type
 */
router.put('/:id/privacy/type', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { type } = req.body;

    if (!['public', 'private'].includes(type)) {
      return res.status(400).json({ error: 'Invalid privacy type' });
    }

    const result = await channelPrivacyService.changePrivacyType(id, type, userId);
    res.json({ success: true, ...result });

  } catch (error) {
    console.error('Change privacy type error:', error);
    if (error.message.includes('permission') || error.message.includes('owner')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to change privacy type' });
  }
});

/**
 * POST /api/channels/:id/invite/create - Create new invite link with options
 */
router.post('/:id/invite/create', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const options = req.body;

    const inviteData = await channelPrivacyService.createInviteLink(id, {
      ...options,
      createdBy: userId
    });

    res.json({
      success: true,
      invite: inviteData
    });

  } catch (error) {
    console.error('Create invite link error:', error);
    if (error.message.includes('permission') || error.message.includes('allow')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create invite link' });
  }
});

/**
 * DELETE /api/channels/:id/invite - Revoke current invite link
 */
router.delete('/:id/invite', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await channelPrivacyService.revokeInviteLink(id, userId);
    res.json({ success: true, ...result });

  } catch (error) {
    console.error('Revoke invite link error:', error);
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to revoke invite link' });
  }
});

/**
 * GET /api/channels/:id/invite/stats - Get invite statistics
 */
router.get('/:id/invite/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const stats = await channelPrivacyService.getInviteStatistics(id, userId);
    res.json({ stats });

  } catch (error) {
    console.error('Get invite statistics error:', error);
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get invite statistics' });
  }
});

/**
 * GET /api/channels/:id/members/pending - Get pending membership requests
 */
router.get('/:id/members/pending', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const pendingMembers = await channelPrivacyService.getPendingMemberships(id, userId);
    res.json({
      pending: pendingMembers.map(member => ({
        id: member.id,
        user: member.user,
        joinedAt: member.joinedAt,
        invitedBy: member.invitedBy
      }))
    });

  } catch (error) {
    console.error('Get pending members error:', error);
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get pending members' });
  }
});

/**
 * POST /api/channels/:id/members/:userId/approve - Approve membership request
 */
router.post('/:id/members/:userId/approve', authenticateToken, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const approverId = req.user.id;

    const member = await channelPrivacyService.approveMembership(id, userId, approverId);
    
    // Emit Socket.IO event
    const io = require('../socket').io;
    const socketId = await redis.get(`user_socket:${userId}`);
    if (socketId) {
      io.to(socketId).emit('membership_approved', {
        channelId: id,
        role: member.role
      });
    }

    res.json({ success: true, member });

  } catch (error) {
    console.error('Approve membership error:', error);
    if (error.message.includes('permission') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to approve membership' });
  }
});

/**
 * POST /api/channels/:id/members/:userId/reject - Reject membership request
 */
router.post('/:id/members/:userId/reject', authenticateToken, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const rejectorId = req.user.id;
    const { reason } = req.body;

    const result = await channelPrivacyService.rejectMembership(id, userId, rejectorId, reason);
    
    // Emit Socket.IO event
    const io = require('../socket').io;
    const socketId = await redis.get(`user_socket:${userId}`);
    if (socketId) {
      io.to(socketId).emit('membership_rejected', {
        channelId: id,
        reason
      });
    }

    res.json(result);

  } catch (error) {
    console.error('Reject membership error:', error);
    if (error.message.includes('permission') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to reject membership' });
  }
});

/**
 * GET /api/channels/:id/admins - Get channel administrators
 */
router.get('/:id/admins', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const admins = await channelAdminService.getAdministrators(id, userId);
    res.json({ admins });

  } catch (error) {
    console.error('Get administrators error:', error);
    if (error.message.includes('member')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get administrators' });
  }
});

/**
 * POST /api/channels/:id/admins/:userId/promote - Promote member to admin
 */
router.post('/:id/admins/:userId/promote', authenticateToken, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const promoterId = req.user.id;
    const { permissions } = req.body;

    const member = await channelAdminService.promoteToAdmin(id, userId, promoterId, permissions);
    res.json({ success: true, member });

  } catch (error) {
    console.error('Promote admin error:', error);
    if (error.message.includes('permission') || error.message.includes('member')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to promote admin' });
  }
});

/**
 * POST /api/channels/:id/admins/:userId/demote - Demote admin to member
 */
router.post('/:id/admins/:userId/demote', authenticateToken, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const demoterId = req.user.id;

    const member = await channelAdminService.demoteToMember(id, userId, demoterId);
    res.json({ success: true, member });

  } catch (error) {
    console.error('Demote admin error:', error);
    if (error.message.includes('permission') || error.message.includes('admin')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to demote admin' });
  }
});

/**
 * PUT /api/channels/:id/admins/:userId/permissions - Update admin permissions
 */
router.put('/:id/admins/:userId/permissions', authenticateToken, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const updaterId = req.user.id;
    const { permissions } = req.body;

    const member = await channelAdminService.updateAdminPermissions(id, userId, updaterId, permissions);
    res.json({ success: true, member });

  } catch (error) {
    console.error('Update admin permissions error:', error);
    if (error.message.includes('permission') || error.message.includes('admin')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update admin permissions' });
  }
});

/**
 * POST /api/channels/:id/ban/:userId - Ban user from channel
 */
router.post('/:id/ban/:userId', authenticateToken, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const bannerId = req.user.id;
    const options = req.body;

    const result = await channelAdminService.banUser(id, userId, bannerId, options);
    res.json(result);

  } catch (error) {
    console.error('Ban user error:', error);
    if (error.message.includes('permission') || error.message.includes('member') || error.message.includes('owner')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

/**
 * POST /api/channels/:id/unban/:userId - Unban user from channel
 */
router.post('/:id/unban/:userId', authenticateToken, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const unbannerId = req.user.id;

    const result = await channelAdminService.unbanUser(id, userId, unbannerId);
    res.json(result);

  } catch (error) {
    console.error('Unban user error:', error);
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

/**
 * POST /api/channels/:id/remove/:userId - Remove member from channel
 */
router.post('/:id/remove/:userId', authenticateToken, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const removerId = req.user.id;

    const result = await channelAdminService.removeMember(id, userId, removerId);
    res.json(result);

  } catch (error) {
    console.error('Remove member error:', error);
    if (error.message.includes('permission') || error.message.includes('member') || error.message.includes('owner')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

/**
 * POST /api/channels/:id/transfer - Transfer channel ownership
 */
router.post('/:id/transfer', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const currentOwnerId = req.user.id;
    const { newOwnerId } = req.body;

    if (!newOwnerId) {
      return res.status(400).json({ error: 'New owner ID is required' });
    }

    const result = await channelAdminService.transferOwnership(id, newOwnerId, currentOwnerId);
    res.json(result);

  } catch (error) {
    console.error('Transfer ownership error:', error);
    if (error.message.includes('owner') || error.message.includes('member')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to transfer ownership' });
  }
});

/**
 * GET /api/channels/:id/stats - Get channel statistics
 */
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const stats = await channelAdminService.getChannelStats(id, userId);
    res.json({ stats });

  } catch (error) {
    console.error('Get channel stats error:', error);
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get channel statistics' });
  }
});

/**
 * GET /api/channels/:id/admin/log - Get admin activity log
 */
router.get('/:id/admin/log', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const options = req.query;

    const result = await channelAdminService.getAdminLog(id, userId, options);
    res.json(result);

  } catch (error) {
    console.error('Get admin log error:', error);
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get admin log' });
  }
});

/**
 * GET /api/channels/:id/bans - Get banned users
 */
router.get('/:id/bans', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    // Check if user has permission
    const canBan = await channelAdminService.hasPermission(id, userId, 'canBanUsers');
    if (!canBan) {
      return res.status(403).json({ error: 'You do not have permission to view banned users' });
    }

    const bans = await ChannelBan.getActiveBans(id, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({ bans });

  } catch (error) {
    console.error('Get banned users error:', error);
    res.status(500).json({ error: 'Failed to get banned users' });
  }
});

module.exports = router;
