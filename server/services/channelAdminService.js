const { Channel, ChannelMember, ChannelBan, User, Post, AdminLog } = require('../models');

/**
 * Service for managing channel administration
 */
class ChannelAdminService {
  /**
   * Default admin permissions
   */
  static getDefaultPermissions() {
    return {
      canManageMembers: true,
      canBanUsers: true,
      canManagePosts: true,
      canDeletePosts: true,
      canManageSettings: false,
      canChangePrivacy: false,
      canManageInvites: true,
      canViewStats: true,
      canManageEvents: true,
      canManagePolls: true,
      canManageProducts: false,
      canTransferOwnership: false
    };
  }

  /**
   * Check if user has specific admin permission
   */
  async hasPermission(channelId, userId, permission) {
    const member = await ChannelMember.findOne({
      where: {
        channelId,
        userId,
        isActive: true,
        role: ['admin', 'owner']
      }
    });

    if (!member) return false;
    if (member.role === 'owner') return true;

    const permissions = member.permissions || this.getDefaultPermissions();
    return permissions[permission] === true;
  }

  /**
   * Promote member to admin
   */
  async promoteToAdmin(channelId, targetUserId, promoterId, permissions = null) {
    // Check if promoter has permission
    const canPromote = await this.hasPermission(channelId, promoterId, 'canManageMembers');
    if (!canPromote) {
      throw new Error('You do not have permission to promote members');
    }

    // Check if target is member
    const member = await ChannelMember.findOne({
      where: {
        channelId,
        userId: targetUserId,
        isActive: true
      }
    });

    if (!member) {
      throw new Error('User is not a channel member');
    }

    if (member.role === 'owner') {
      throw new Error('Cannot promote channel owner');
    }

    if (member.role === 'admin') {
      throw new Error('User is already an admin');
    }

    // Promote to admin
    member.role = 'admin';
    member.permissions = permissions || this.getDefaultPermissions();
    await member.save();

    // Log action
    await AdminLog.create({
      adminId: promoterId,
      action: 'channel_admin_promote',
      details: {
        channelId,
        targetUserId,
        permissions: member.permissions
      }
    });

    // Emit Socket.IO event
    const io = require('../socket').io;
    const socketId = await redis.get(`user_socket:${targetUserId}`);
    if (socketId) {
      io.to(socketId).emit('admin_promoted', {
        channelId,
        role: 'admin',
        permissions: member.permissions
      });
    }

    return member;
  }

  /**
   * Demote admin to member
   */
  async demoteToMember(channelId, targetUserId, demoterId) {
    // Check if demoter has permission
    const canDemote = await this.hasPermission(channelId, demoterId, 'canManageMembers');
    if (!canDemote) {
      throw new Error('You do not have permission to demote admins');
    }

    // Check if target is admin
    const member = await ChannelMember.findOne({
      where: {
        channelId,
        userId: targetUserId,
        isActive: true,
        role: 'admin'
      }
    });

    if (!member) {
      throw new Error('User is not an admin');
    }

    // Demote to member
    member.role = 'member';
    member.permissions = null;
    await member.save();

    // Log action
    await AdminLog.create({
      adminId: demoterId,
      action: 'channel_admin_demote',
      details: {
        channelId,
        targetUserId
      }
    });

    // Emit Socket.IO event
    const io = require('../socket').io;
    const socketId = await redis.get(`user_socket:${targetUserId}`);
    if (socketId) {
      io.to(socketId).emit('admin_demoted', {
        channelId,
        role: 'member'
      });
    }

    return member;
  }

  /**
   * Update admin permissions
   */
  async updateAdminPermissions(channelId, targetUserId, updaterId, newPermissions) {
    // Check if updater has permission
    const canManagePermissions = await this.hasPermission(channelId, updaterId, 'canManageMembers');
    if (!canManagePermissions) {
      throw new Error('You do not have permission to manage admin permissions');
    }

    // Check if target is admin
    const member = await ChannelMember.findOne({
      where: {
        channelId,
        userId: targetUserId,
        isActive: true,
        role: 'admin'
      }
    });

    if (!member) {
      throw new Error('User is not an admin');
    }

    // Validate permissions
    const validPermissions = Object.keys(this.getDefaultPermissions());
    const invalidPermissions = Object.keys(newPermissions).filter(p => !validPermissions.includes(p));
    
    if (invalidPermissions.length > 0) {
      throw new Error(`Invalid permissions: ${invalidPermissions.join(', ')}`);
    }

    // Update permissions
    const oldPermissions = member.permissions;
    member.permissions = { ...member.permissions, ...newPermissions };
    await member.save();

    // Log action
    await AdminLog.create({
      adminId: updaterId,
      action: 'channel_admin_permissions_update',
      details: {
        channelId,
        targetUserId,
        oldPermissions,
        newPermissions: member.permissions
      }
    });

    // Emit Socket.IO event
    const io = require('../socket').io;
    const socketId = await redis.get(`user_socket:${targetUserId}`);
    if (socketId) {
      io.to(socketId).emit('admin_permissions_updated', {
        channelId,
        permissions: member.permissions
      });
    }

    return member;
  }

  /**
   * Ban user from channel
   */
  async banUser(channelId, targetUserId, bannerId, options = {}) {
    const {
      reason = null,
      duration = null,
      type = 'permanent',
      deletePosts = false
    } = options;

    // Check if banner has permission
    const canBan = await this.hasPermission(channelId, bannerId, 'canBanUsers');
    if (!canBan) {
      throw new Error('You do not have permission to ban users');
    }

    // Check if target is member
    const member = await ChannelMember.findOne({
      where: {
        channelId,
        userId: targetUserId,
        isActive: true
      }
    });

    if (!member) {
      throw new Error('User is not a channel member');
    }

    // Cannot ban owner
    if (member.role === 'owner') {
      throw new Error('Cannot ban channel owner');
    }

    // Cannot ban other admins unless banner is owner
    if (member.role === 'admin') {
      const bannerMember = await ChannelMember.findOne({
        where: {
          channelId,
          userId: bannerId,
          isActive: true
        }
      });

      if (bannerMember.role !== 'owner') {
        throw new Error('Only channel owner can ban admins');
      }
    }

    // Create ban
    await ChannelBan.banUser(channelId, targetUserId, bannerId, {
      reason,
      type,
      duration
    });

    // Optionally delete user's posts
    if (deletePosts) {
      await Post.update(
        { isActive: false, deletedAt: new Date(), deletedBy: bannerId },
        { where: { channelId, authorId: targetUserId, isActive: true } }
      );
    }

    // Log action
    await AdminLog.create({
      adminId: bannerId,
      action: 'channel_user_ban',
      details: {
        channelId,
        targetUserId,
        reason,
        type,
        duration,
        deletePosts
      }
    });

    // Emit Socket.IO event
    const io = require('../socket').io;
    const socketId = await redis.get(`user_socket:${targetUserId}`);
    if (socketId) {
      io.to(socketId).emit('banned_from_channel', {
        channelId,
        reason,
        type,
        duration
      });
    }

    return { success: true };
  }

  /**
   * Unban user from channel
   */
  async unbanUser(channelId, targetUserId, unbannerId) {
    // Check if unbanner has permission
    const canUnban = await this.hasPermission(channelId, unbannerId, 'canBanUsers');
    if (!canUnban) {
      throw new Error('You do not have permission to unban users');
    }

    // Check if user is banned
    const isBanned = await ChannelBan.isBanned(channelId, targetUserId);
    if (!isBanned) {
      throw new Error('User is not banned from this channel');
    }

    // Remove ban
    await ChannelBan.unbanUser(channelId, targetUserId);

    // Log action
    await AdminLog.create({
      adminId: unbannerId,
      action: 'channel_user_unban',
      details: {
        channelId,
        targetUserId
      }
    });

    // Emit Socket.IO event
    const io = require('../socket').io;
    const socketId = await redis.get(`user_socket:${targetUserId}`);
    if (socketId) {
      io.to(socketId).emit('unbanned_from_channel', {
        channelId
      });
    }

    return { success: true };
  }

  /**
   * Remove member from channel
   */
  async removeMember(channelId, targetUserId, removerId) {
    // Check if remover has permission
    const canRemove = await this.hasPermission(channelId, removerId, 'canManageMembers');
    if (!canRemove) {
      throw new Error('You do not have permission to remove members');
    }

    // Check if target is member
    const member = await ChannelMember.findOne({
      where: {
        channelId,
        userId: targetUserId,
        isActive: true
      }
    });

    if (!member) {
      throw new Error('User is not a channel member');
    }

    // Cannot remove owner
    if (member.role === 'owner') {
      throw new Error('Cannot remove channel owner');
    }

    // Cannot remove other admins unless remover is owner
    if (member.role === 'admin') {
      const removerMember = await ChannelMember.findOne({
        where: {
          channelId,
          userId: removerId,
          isActive: true
        }
      });

      if (removerMember.role !== 'owner') {
        throw new Error('Only channel owner can remove admins');
      }
    }

    // Remove member
    await ChannelMember.removeMember(channelId, targetUserId);

    // Log action
    await AdminLog.create({
      adminId: removerId,
      action: 'channel_member_remove',
      details: {
        channelId,
        targetUserId,
        previousRole: member.role
      }
    });

    // Emit Socket.IO event
    const io = require('../socket').io;
    const socketId = await redis.get(`user_socket:${targetUserId}`);
    if (socketId) {
      io.to(socketId).emit('removed_from_channel', {
        channelId
      });
    }

    return { success: true };
  }

  /**
   * Transfer channel ownership
   */
  async transferOwnership(channelId, newOwnerId, currentOwnerId) {
    // Check if current owner is actually the owner
    const channel = await Channel.findByPk(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.ownerId !== currentOwnerId) {
      throw new Error('Only channel owner can transfer ownership');
    }

    // Check if new owner is member
    const newOwnerMember = await ChannelMember.findOne({
      where: {
        channelId,
        userId: newOwnerId,
        isActive: true
      }
    });

    if (!newOwnerMember) {
      throw new Error('New owner must be a channel member');
    }

    // Transfer ownership
    const oldOwnerId = channel.ownerId;
    channel.ownerId = newOwnerId;
    await channel.save();

    // Update member roles
    await ChannelMember.update(
      { role: 'member' },
      { where: { channelId, userId: oldOwnerId } }
    );

    await ChannelMember.update(
      { role: 'owner', permissions: null },
      { where: { channelId, userId: newOwnerId } }
    );

    // Log action
    await AdminLog.create({
      adminId: currentOwnerId,
      action: 'channel_ownership_transfer',
      details: {
        channelId,
        oldOwnerId,
        newOwnerId
      }
    });

    // Emit Socket.IO event
    const io = require('../socket').io;
    
    // Notify new owner
    const newOwnerSocketId = await redis.get(`user_socket:${newOwnerId}`);
    if (newOwnerSocketId) {
      io.to(newOwnerSocketId).emit('ownership_transferred', {
        channelId,
        isOwner: true
      });
    }

    // Notify old owner
    const oldOwnerSocketId = await redis.get(`user_socket:${oldOwnerId}`);
    if (oldOwnerSocketId) {
      io.to(oldOwnerSocketId).emit('ownership_transferred', {
        channelId,
        isOwner: false
      });
    }

    return { success: true, newOwnerId };
  }

  /**
   * Get channel administrators
   */
  async getAdministrators(channelId, requesterId) {
    // Check if requester is member
    const isMember = await ChannelMember.isMember(channelId, requesterId);
    if (!isMember) {
      throw new Error('You must be a channel member to view administrators');
    }

    const admins = await ChannelMember.getAdmins(channelId);
    
    return admins.map(admin => ({
      id: admin.id,
      user: admin.user,
      role: admin.role,
      permissions: admin.permissions,
      joinedAt: admin.joinedAt
    }));
  }

  /**
   * Get channel statistics for admins
   */
  async getChannelStats(channelId, requesterId) {
    // Check if requester has permission
    const canViewStats = await this.hasPermission(channelId, requesterId, 'canViewStats');
    if (!canViewStats) {
      throw new Error('You do not have permission to view channel statistics');
    }

    const channel = await Channel.findByPk(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Get member stats
    const memberStats = await ChannelMember.getMemberStats(channelId);
    
    // Get post stats
    const postStats = await Post.findAll({
      where: { channelId },
      attributes: [
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'total'],
        [require('sequelize').fn('COUNT', require('sequelize').literal('CASE WHEN is_active = true THEN 1 END')), 'active'],
        [require('sequelize').fn('COUNT', require('sequelize').literal('CASE WHEN is_pinned = true THEN 1 END')), 'pinned']
      ],
      raw: true
    });

    // Get ban stats
    const banStats = await ChannelBan.getStatistics(channelId);

    return {
      channel: {
        name: channel.name,
        type: channel.type,
        memberCount: channel.memberCount,
        postCount: channel.postCount,
        createdAt: channel.createdAt,
        lastActivityAt: channel.lastActivityAt
      },
      members: memberStats,
      posts: postStats[0],
      bans: banStats
    };
  }

  /**
   * Get admin activity log
   */
  async getAdminLog(channelId, requesterId, options = {}) {
    // Check if requester has permission
    const canViewStats = await this.hasPermission(channelId, requesterId, 'canViewStats');
    if (!canViewStats) {
      throw new Error('You do not have permission to view admin log');
    }

    const { page = 1, limit = 50, action = null } = options;
    const offset = (page - 1) * limit;

    const whereClause = {
      action: {
        [require('sequelize').Op.like]: 'channel_%'
      },
      'details.channelId': channelId
    };

    if (action) {
      whereClause.action = action;
    }

    const { count, rows } = await AdminLog.findAndCountAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'admin',
        attributes: ['id', 'name', 'username', 'avatar']
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      logs: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalLogs: count,
        limit
      }
    };
  }
}

// Export singleton instance
const channelAdminService = new ChannelAdminService();

module.exports = {
  ChannelAdminService,
  channelAdminService
};
