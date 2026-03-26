const { 
  Post, 
  PostComment, 
  PostReaction, 
  PostAttachment,
  Channel, 
  ChannelMember, 
  User,
  AdminLog 
} = require('../models');

/**
 * Service for managing channel posts
 */
class PostService {
  /**
   * Create a new post
   */
  async createPost(channelId, authorId, postData) {
    const {
      type = 'text',
      title = null,
      content,
      attachments = [],
      mentions = [],
      hashtags = [],
      isPinned = false,
      isScheduled = false,
      scheduledAt = null,
      allowComments = true,
      allowReactions = true,
      priority = 'normal',
      location = null,
      metadata = null,
      seo = null
    } = postData;

    // Check if user can post in channel
    const channel = await Channel.findByPk(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const canPost = await channel.canPost(authorId);
    if (!canPost) {
      throw new Error('You do not have permission to post in this channel');
    }

    // Validate content based on type
    if (!content && !title && attachments.length === 0) {
      throw new Error('Post must have content, title, or attachments');
    }

    // Create post
    const post = await Post.create({
      channelId,
      authorId,
      type,
      title: title?.trim() || null,
      content: content?.trim() || null,
      attachments,
      mentions,
      hashtags,
      isPinned,
      isScheduled,
      scheduledAt: isScheduled && scheduledAt ? new Date(scheduledAt) : null,
      isPublished: !isScheduled,
      publishedAt: !isScheduled ? new Date() : null,
      allowComments,
      allowReactions,
      priority,
      location,
      metadata,
      seo
    });

    // Create attachments if provided
    if (attachments.length > 0) {
      await this.createPostAttachments(post.id, attachments);
    }

    // Update channel activity
    await channel.updateLastActivity();

    // Log post creation
    await AdminLog.create({
      adminId: authorId,
      action: 'post_create',
      details: {
        postId: post.id,
        channelId,
        type: post.type
      }
    });

    // Emit Socket.IO event
    const io = require('../socket').io;
    io.emit('new_post', {
      postId: post.id,
      channelId,
      author: {
        id: authorId,
        name: (await User.findByPk(authorId))?.name
      },
      type: post.type
    });

    return post;
  }

  /**
   * Update an existing post
   */
  async updatePost(postId, userId, updateData) {
    const post = await Post.findByPk(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    // Check if user can edit post
    const canEdit = await post.canEdit(userId);
    if (!canEdit) {
      throw new Error('You do not have permission to edit this post');
    }

    // Don't allow editing certain fields after publication
    const allowedFields = [
      'title', 'content', 'attachments', 'mentions', 'hashtags',
      'allowComments', 'allowReactions', 'priority', 'location',
      'metadata', 'seo'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (updateData.hasOwnProperty(field)) {
        updates[field] = updateData[field];
      }
    });

    // Edit post content if changed
    if (updates.content && updates.content !== post.content) {
      await post.edit(updates.content, userId);
      delete updates.content; // Already handled by edit method
    }

    // Update other fields
    if (Object.keys(updates).length > 0) {
      await post.update(updates);
    }

    // Update attachments if provided
    if (updateData.attachments) {
      await this.updatePostAttachments(postId, updateData.attachments);
    }

    // Log edit
    await AdminLog.create({
      adminId: userId,
      action: 'post_edit',
      details: {
        postId: post.id,
        updates: Object.keys(updates)
      }
    });

    return post;
  }

  /**
   * Delete a post
   */
  async deletePost(postId, userId) {
    const post = await Post.findByPk(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    // Check if user can delete post
    const canDelete = await post.canDelete(userId);
    if (!canDelete) {
      throw new Error('You do not have permission to delete this post');
    }

    // Soft delete post
    await post.softDelete(userId);

    // Log deletion
    await AdminLog.create({
      adminId: userId,
      action: 'post_delete',
      details: {
        postId: post.id,
        channelId: post.channelId
      }
    });

    // Emit Socket.IO event
    const io = require('../socket').io;
    io.emit('post_deleted', {
      postId,
      channelId: post.channelId
    });

    return { success: true };
  }

  /**
   * Get posts for a channel
   */
  async getChannelPosts(channelId, userId = null, options = {}) {
    // Check if user can access channel
    const canAccess = await require('./channelPrivacyService').channelPrivacyService.canAccessChannel(channelId, userId);
    if (!canAccess.canAccess) {
      throw new Error(canAccess.reason);
    }

    const {
      page = 1,
      limit = 20,
      type = null,
      authorId = null,
      isPinned = null,
      sortBy = 'published_at',
      sortOrder = 'DESC',
      includeComments = false,
      includeReactions = false
    } = options;

    return await Post.findChannelPosts(channelId, {
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      authorId,
      isPinned,
      sortBy,
      sortOrder,
      includeComments,
      includeReactions
    });
  }

  /**
   * Get a single post with full details
   */
  async getPost(postId, userId = null) {
    const post = await Post.findByPk(postId, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'name', 'username', 'avatar']
        },
        {
          model: Channel,
          as: 'channel',
          attributes: ['id', 'name', 'username', 'type']
        }
      ]
    });

    if (!post || !post.isPublished || post.deletedAt) {
      throw new Error('Post not found');
    }

    // Check if user can access channel
    const canAccess = await require('./channelPrivacyService').channelPrivacyService.canAccessChannel(post.channelId, userId);
    if (!canAccess.canAccess) {
      throw new Error(canAccess.reason);
    }

    // Increment view count
    await post.incrementViews();

    // Get attachments
    const attachments = await PostAttachment.getPostAttachments(postId);

    // Get reactions
    const reactions = await PostReaction.getReactionStats(postId);

    // Get user's reaction if authenticated
    let userReaction = null;
    if (userId) {
      userReaction = await PostReaction.getUserPostReaction(postId, userId);
    }

    return {
      post: {
        ...post.toJSON(),
        attachments: attachments.map(a => a.getDisplayInfo()),
        reactions,
        userReaction: userReaction?.emoji || null
      }
    };
  }

  /**
   * Pin/unpin a post
   */
  async togglePinPost(postId, userId) {
    const post = await Post.findByPk(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    // Check if user can pin (admin or owner)
    const channel = await Channel.findByPk(post.channelId);
    const isAdmin = await channel.isAdmin(userId);
    if (!isAdmin) {
      throw new Error('Only channel admins can pin posts');
    }

    if (post.isPinned) {
      await post.unpin();
    } else {
      await post.pin();
    }

    // Log action
    await AdminLog.create({
      adminId: userId,
      action: post.isPinned ? 'post_pin' : 'post_unpin',
      details: {
        postId: post.id,
        channelId: post.channelId
      }
    });

    // Emit Socket.IO event
    const io = require('../socket').io;
    io.emit('post_pin_toggled', {
      postId,
      channelId: post.channelId,
      isPinned: post.isPinned
    });

    return { isPinned: post.isPinned };
  }

  /**
   * Add reaction to post
   */
  async addPostReaction(postId, userId, emoji) {
    const post = await Post.findByPk(postId);
    if (!post || !post.allowReactions) {
      throw new Error('Post not found or reactions not allowed');
    }

    // Check if user can access channel
    const canAccess = await require('./channelPrivacyService').channelPrivacyService.canAccessChannel(post.channelId, userId);
    if (!canAccess.canAccess) {
      throw new Error(canAccess.reason);
    }

    const reaction = await post.addReaction(userId, emoji);

    // Emit Socket.IO event
    const io = require('../socket').io;
    io.emit('post_reaction_added', {
      postId,
      userId,
      emoji,
      reactionCounts: post.reactions
    });

    return reaction;
  }

  /**
   * Remove reaction from post
   */
  async removePostReaction(postId, userId, emoji) {
    const post = await Post.findByPk(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    // Check if user can access channel
    const canAccess = await require('./channelPrivacyService').channelPrivacyService.canAccessChannel(post.channelId, userId);
    if (!canAccess.canAccess) {
      throw new Error(canAccess.reason);
    }

    const reaction = await post.removeReaction(userId, emoji);

    // Emit Socket.IO event
    const io = require('../socket').io;
    io.emit('post_reaction_removed', {
      postId,
      userId,
      emoji,
      reactionCounts: post.reactions
    });

    return reaction;
  }

  /**
   * Get user's posts
   */
  async getUserPosts(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      channelId = null,
      type = null
    } = options;

    return await Post.findUserPosts(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      channelId,
      type
    });
  }

  /**
   * Search posts
   */
  async searchPosts(query, userId = null, options = {}) {
    const {
      page = 1,
      limit = 20,
      channelId = null,
      type = null
    } = options;

    let results = await Post.searchPosts(query, {
      page: parseInt(page),
      limit: parseInt(limit),
      channelId,
      type
    });

    // Filter posts from channels user can access
    if (userId) {
      const accessiblePosts = [];
      
      for (const post of results.posts) {
        const canAccess = await require('./channelPrivacyService').channelPrivacyService.canAccessChannel(post.channelId, userId);
        if (canAccess.canAccess) {
          accessiblePosts.push(post);
        }
      }
      
      results.posts = accessiblePosts;
    }

    return results;
  }

  /**
   * Publish scheduled posts
   */
  async publishScheduledPosts() {
    const scheduledPosts = await Post.findScheduledPosts();
    let publishedCount = 0;

    for (const post of scheduledPosts) {
      try {
        await post.publish();
        publishedCount++;

        // Emit Socket.IO event
        const io = require('../socket').io;
        io.emit('scheduled_post_published', {
          postId: post.id,
          channelId: post.channelId
        });

      } catch (error) {
        console.error(`Failed to publish scheduled post ${post.id}:`, error);
      }
    }

    console.log(`Published ${publishedCount} scheduled posts`);
    return publishedCount;
  }

  /**
   * Create post attachments
   */
  async createPostAttachments(postId, attachments) {
    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i];
      
      switch (attachment.type) {
        case 'image':
          await PostAttachment.createImageAttachment(postId, {
            ...attachment,
            order: i
          });
          break;
        
        case 'video':
          await PostAttachment.createVideoAttachment(postId, {
            ...attachment,
            order: i
          });
          break;
        
        case 'document':
          await PostAttachment.createDocumentAttachment(postId, {
            ...attachment,
            order: i
          });
          break;
        
        case 'link':
          await PostAttachment.createLinkAttachment(postId, {
            ...attachment,
            order: i
          });
          break;
        
        case 'poll':
          await PostAttachment.createPollAttachment(postId, attachment.pollId, i);
          break;
        
        case 'event':
          await PostAttachment.createEventAttachment(postId, attachment.eventId, i);
          break;
        
        case 'product':
          await PostAttachment.createProductAttachment(postId, attachment.productId, i);
          break;
      }
    }
  }

  /**
   * Update post attachments
   */
  async updatePostAttachments(postId, attachments) {
    // Deactivate existing attachments
    await PostAttachment.update(
      { isActive: false },
      { where: { postId } }
    );

    // Create new attachments
    await this.createPostAttachments(postId, attachments);
  }

  /**
   * Get post statistics
   */
  async getPostStats(postId, userId) {
    const post = await Post.findByPk(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    // Check if user can view stats (admin or author)
    const channel = await Channel.findByPk(post.channelId);
    const isAdmin = await channel.isAdmin(userId);
    const isAuthor = post.authorId === userId;

    if (!isAdmin && !isAuthor) {
      throw new Error('You do not have permission to view post statistics');
    }

    // Get attachment stats
    const attachmentStats = await PostAttachment.getAttachmentStats(postId);

    // Get reaction stats
    const reactionStats = await PostReaction.getReactionStats(postId);

    // Get comment stats
    const commentCount = await PostComment.count({
      where: {
        postId,
        isActive: true,
        isDeleted: false
      }
    });

    return {
      post: {
        id: post.id,
        title: post.title,
        type: post.type,
        views: post.views,
        likes: post.likes,
        comments: commentCount,
        shares: post.shares,
        publishedAt: post.publishedAt,
        lastActivityAt: post.updatedAt
      },
      attachments: attachmentStats,
      reactions: reactionStats
    };
  }
}

// Export singleton instance
const postService = new PostService();

module.exports = {
  PostService,
  postService
};
