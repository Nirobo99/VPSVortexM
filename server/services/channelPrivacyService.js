const { Channel, ChannelMember, ChannelBan, User } = require('../models');
const crypto = require('crypto');

/**
 * Service for managing channel privacy and invitations
 */
class ChannelPrivacyService {
  /**
   * Generate secure invite code
   */
  generateInviteCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  /**
   * Generate secure invite link
   */
  generateInviteLink(channelId, code = null) {
    const inviteCode = code || this.generateInviteCode();
    return {
      code: inviteCode,
      link: `https://vortexym.com/join/${inviteCode}`,
      qrCode: `vortexym://join/${inviteCode}`
    };
  }

  /**
   * Create new invite link for channel
   */
  async createInviteLink(channelId, options = {}) {
    const {
      expiresAt = null,
      maxUses = null,
      requireApproval = false,
      createdBy = null
    } = options;

    const channel = await Channel.findByPk(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (!channel.allowInvites) {
      throw new Error('Channel does not allow invitations');
    }

    const inviteData = this.generateInviteLink(channelId);
    
    // Update channel with new invite code
    channel.inviteCode = inviteData.code;
    channel.inviteLink = inviteData.link;
    
    // Store additional invite settings in metadata
    if (!channel.metadata) channel.metadata = {};
    channel.metadata.inviteSettings = {
      expiresAt,
      maxUses,
      requireApproval,
      uses: 0,
      createdAt: new Date(),
      createdBy
    };
    
    await channel.save();

    return {
      ...inviteData,
      settings: channel.metadata.inviteSettings
    };
  }

  /**
   * Validate and use invite link
   */
  async useInviteLink(inviteCode, userId) {
    const channel = await Channel.findByInviteCode(inviteCode);
    if (!channel) {
      throw new Error('Invalid invite code');
    }

    // Check if invite has expired
    const inviteSettings = channel.metadata?.inviteSettings;
    if (inviteSettings?.expiresAt && new Date() > new Date(inviteSettings.expiresAt)) {
      throw new Error('Invite link has expired');
    }

    // Check max uses
    if (inviteSettings?.maxUses && inviteSettings.uses >= inviteSettings.maxUses) {
      throw new Error('Invite link has reached maximum uses');
    }

    // Check if user is banned
    const isBanned = await ChannelBan.isBanned(channel.id, userId);
    if (isBanned) {
      throw new Error('You are banned from this channel');
    }

    // Check if user is already a member
    const isMember = await channel.isMember(userId);
    if (isMember) {
      throw new Error('Already a member of this channel');
    }

    // Handle approval requirement
    const requireApproval = inviteSettings?.requireApproval || channel.requireApproval;
    
    if (requireApproval) {
      // Create pending membership
      const [member] = await ChannelMember.addMember(channel.id, userId, {
        role: 'member'
      });

      // Increment invite uses
      if (inviteSettings) {
        inviteSettings.uses++;
        await channel.save();
      }

      return {
        status: 'pending',
        channel: {
          id: channel.id,
          name: channel.name,
          avatar: channel.avatar,
          type: channel.type
        },
        message: 'Membership request sent. Waiting for approval.'
      };
    }

    // Add member directly
    const [member] = await ChannelMember.addMember(channel.id, userId, {
      role: 'member'
    });

    // Update member count
    await channel.updateMemberCount();

    // Increment invite uses
    if (inviteSettings) {
      inviteSettings.uses++;
      await channel.save();
    }

    return {
      status: 'joined',
      channel: {
        id: channel.id,
        name: channel.name,
        avatar: channel.avatar,
        type: channel.type
      },
      member: {
        id: member.id,
        role: member.role,
        joinedAt: member.joinedAt
      }
    };
  }

  /**
   * Approve membership request
   */
  async approveMembership(channelId, userId, approvedBy) {
    const member = await ChannelMember.findOne({
      where: {
        channelId,
        userId,
        isActive: false,
        leftAt: null
      }
    });

    if (!member) {
      throw new Error('Membership request not found');
    }

    // Check if approver has permission
    const channel = await Channel.findByPk(channelId);
    const isAdmin = await channel.isAdmin(approvedBy);
    if (!isAdmin) {
      throw new Error('Only channel admins can approve memberships');
    }

    // Approve membership
    member.isActive = true;
    member.leftAt = null;
    await member.save();

    // Update member count
    await channel.updateMemberCount();

    return member;
  }

  /**
   * Reject membership request
   */
  async rejectMembership(channelId, userId, rejectedBy, reason = null) {
    const member = await ChannelMember.findOne({
      where: {
        channelId,
        userId,
        isActive: false,
        leftAt: null
      }
    });

    if (!member) {
      throw new Error('Membership request not found');
    }

    // Check if rejector has permission
    const channel = await Channel.findByPk(channelId);
    const isAdmin = await channel.isAdmin(rejectedBy);
    if (!isAdmin) {
      throw new Error('Only channel admins can reject memberships');
    }

    // Delete membership request
    await member.destroy();

    return { success: true, reason };
  }

  /**
   * Get pending membership requests
   */
  async getPendingMemberships(channelId, userId) {
    const channel = await Channel.findByPk(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Check if user has permission
    const isAdmin = await channel.isAdmin(userId);
    if (!isAdmin) {
      throw new Error('Only channel admins can view pending memberships');
    }

    const pendingMembers = await ChannelMember.findAll({
      where: {
        channelId,
        isActive: false,
        leftAt: null
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'username', 'avatar']
      }],
      order: [['created_at', 'ASC']]
    });

    return pendingMembers;
  }

  /**
   * Change channel privacy type
   */
  async changePrivacyType(channelId, newType, userId) {
    const channel = await Channel.findByPk(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Only owner can change privacy type
    if (channel.ownerId !== userId) {
      throw new Error('Only channel owner can change privacy type');
    }

    if (channel.type === newType) {
      throw new Error('Channel already has this privacy type');
    }

    const oldType = channel.type;
    channel.type = newType;

    // Reset invite link when changing privacy
    const inviteData = this.generateInviteLink(channelId);
    channel.inviteCode = inviteData.code;
    channel.inviteLink = inviteData.link;

    await channel.save();

    // Handle privacy change effects
    if (newType === 'private') {
      // For private channels, remove all non-members from public view
      // This is handled by the existing privacy checks in APIs
    } else if (newType === 'public' && oldType === 'private') {
      // For public channels, generate new invite link
      // Already done above
    }

    return {
      oldType,
      newType,
      inviteLink: channel.inviteLink
    };
  }

  /**
   * Update channel privacy settings
   */
  async updatePrivacySettings(channelId, settings, userId) {
    const channel = await Channel.findByPk(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Check if user has permission
    const isAdmin = await channel.isAdmin(userId);
    if (!isAdmin) {
      throw new Error('Only channel admins can update privacy settings');
    }

    const allowedSettings = [
      'allowInvites',
      'requireApproval',
      'allowPosting',
      'allowComments'
    ];

    const updates = {};
    allowedSettings.forEach(setting => {
      if (settings.hasOwnProperty(setting)) {
        updates[setting] = settings[setting];
      }
    });

    await channel.update(updates);

    return updates;
  }

  /**
   * Check if user can access channel
   */
  async canAccessChannel(channelId, userId) {
    const channel = await Channel.findByPk(channelId);
    if (!channel || !channel.isActive) {
      return { canAccess: false, reason: 'Channel not found or inactive' };
    }

    // Public channels are accessible to everyone
    if (channel.type === 'public') {
      return { canAccess: true };
    }

    // Private channels require authentication
    if (!userId) {
      return { canAccess: false, reason: 'Authentication required for private channels' };
    }

    // Check if user is member
    const isMember = await channel.isMember(userId);
    if (!isMember) {
      return { canAccess: false, reason: 'Not a member of private channel' };
    }

    // Check if user is banned
    const isBanned = await ChannelBan.isBanned(channelId, userId);
    if (isBanned) {
      return { canAccess: false, reason: 'User is banned from channel' };
    }

    return { canAccess: true };
  }

  /**
   * Get channel privacy info
   */
  async getPrivacyInfo(channelId, userId = null) {
    const channel = await Channel.findByPk(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const privacyInfo = {
      type: channel.type,
      allowInvites: channel.allowInvites,
      requireApproval: channel.requireApproval,
      allowPosting: channel.allowPosting,
      allowComments: channel.allowComments,
      inviteLink: channel.type === 'public' ? channel.inviteLink : null
    };

    // Add user-specific info if authenticated
    if (userId) {
      const isMember = await channel.isMember(userId);
      const isAdmin = await channel.isAdmin(userId);
      const isBanned = await ChannelBan.isBanned(channelId, userId);

      privacyInfo.userStatus = {
        isMember,
        isAdmin,
        isBanned,
        canPost: await channel.canPost(userId)
      };
    }

    return privacyInfo;
  }

  /**
   * Revoke invite link
   */
  async revokeInviteLink(channelId, userId) {
    const channel = await Channel.findByPk(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Check if user has permission
    const isAdmin = await channel.isAdmin(userId);
    if (!isAdmin) {
      throw new Error('Only channel admins can revoke invite links');
    }

    // Generate new invite code (invalidates old one)
    const inviteData = this.generateInviteLink(channelId);
    channel.inviteCode = inviteData.code;
    channel.inviteLink = inviteData.link;

    // Clear invite settings
    if (channel.metadata) {
      channel.metadata.inviteSettings = null;
    }

    await channel.save();

    return {
      newInviteLink: channel.inviteLink,
      newInviteCode: channel.inviteCode
    };
  }

  /**
   * Get invite statistics
   */
  async getInviteStatistics(channelId, userId) {
    const channel = await Channel.findByPk(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Check if user has permission
    const isAdmin = await channel.isAdmin(userId);
    if (!isAdmin) {
      throw new Error('Only channel admins can view invite statistics');
    }

    const inviteSettings = channel.metadata?.inviteSettings;
    
    return {
      inviteCode: channel.inviteCode,
      inviteLink: channel.inviteLink,
      uses: inviteSettings?.uses || 0,
      maxUses: inviteSettings?.maxUses,
      expiresAt: inviteSettings?.expiresAt,
      requireApproval: inviteSettings?.requireApproval || channel.requireApproval,
      createdAt: inviteSettings?.createdAt
    };
  }
}

// Export singleton instance
const channelPrivacyService = new ChannelPrivacyService();

module.exports = {
  ChannelPrivacyService,
  channelPrivacyService
};
