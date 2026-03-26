const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { 
  Post, 
  PostComment, 
  PostReaction, 
  PostAttachment,
  Channel,
  User 
} = require('../models');
const { postService } = require('../services/postService');
const router = express.Router();

/**
 * POST /api/posts - Create a new post
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { channelId, ...postData } = req.body;
    const userId = req.user.id;

    if (!channelId) {
      return res.status(400).json({ error: 'Channel ID is required' });
    }

    const post = await postService.createPost(channelId, userId, postData);
    
    res.status(201).json({
      success: true,
      post: {
        id: post.id,
        type: post.type,
        title: post.title,
        content: post.content,
        attachments: post.attachments,
        mentions: post.mentions,
        hashtags: post.hashtags,
        isPinned: post.isPinned,
        isScheduled: post.isScheduled,
        scheduledAt: post.scheduledAt,
        allowComments: post.allowComments,
        allowReactions: post.allowReactions,
        priority: post.priority,
        location: post.location,
        publishedAt: post.publishedAt,
        createdAt: post.createdAt
      }
    });

  } catch (error) {
    console.error('Create post error:', error);
    if (error.message.includes('permission') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create post' });
  }
});

/**
 * GET /api/posts/channel/:channelId - Get posts for a channel
 */
router.get('/channel/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user?.id;
    const options = req.query;

    const result = await postService.getChannelPosts(channelId, userId, options);
    res.json(result);

  } catch (error) {
    console.error('Get channel posts error:', error);
    if (error.message.includes('access')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get posts' });
  }
});

/**
 * GET /api/posts/:id - Get a single post
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const result = await postService.getPost(id, userId);
    res.json(result);

  } catch (error) {
    console.error('Get post error:', error);
    if (error.message.includes('not found') || error.message.includes('access')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get post' });
  }
});

/**
 * PUT /api/posts/:id - Update a post
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updateData = req.body;

    const post = await postService.updatePost(id, userId, updateData);
    
    res.json({
      success: true,
      post: {
        id: post.id,
        title: post.title,
        content: post.content,
        attachments: post.attachments,
        mentions: post.mentions,
        hashtags: post.hashtags,
        allowComments: post.allowComments,
        allowReactions: post.allowReactions,
        priority: post.priority,
        location: post.location,
        isEdited: post.isEdited,
        editedAt: post.editedAt,
        updatedAt: post.updatedAt
      }
    });

  } catch (error) {
    console.error('Update post error:', error);
    if (error.message.includes('permission') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update post' });
  }
});

/**
 * DELETE /api/posts/:id - Delete a post
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await postService.deletePost(id, userId);
    res.json(result);

  } catch (error) {
    console.error('Delete post error:', error);
    if (error.message.includes('permission') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

/**
 * POST /api/posts/:id/pin - Pin/unpin a post
 */
router.post('/:id/pin', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await postService.togglePinPost(id, userId);
    res.json(result);

  } catch (error) {
    console.error('Pin post error:', error);
    if (error.message.includes('permission') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to pin post' });
  }
});

/**
 * POST /api/posts/:id/reactions - Add reaction to post
 */
router.post('/:id/reactions', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }

    const reaction = await postService.addPostReaction(id, userId, emoji);
    res.json({ success: true, reaction });

  } catch (error) {
    console.error('Add reaction error:', error);
    if (error.message.includes('not found') || error.message.includes('access')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

/**
 * DELETE /api/posts/:id/reactions/:emoji - Remove reaction from post
 */
router.delete('/:id/reactions/:emoji', authenticateToken, async (req, res) => {
  try {
    const { id, emoji } = req.params;
    const userId = req.user.id;

    const reaction = await postService.removePostReaction(id, userId, emoji);
    res.json({ success: true, reaction });

  } catch (error) {
    console.error('Remove reaction error:', error);
    if (error.message.includes('not found') || error.message.includes('access')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

/**
 * GET /api/posts/:id/reactions - Get reactions for a post
 */
router.get('/:id/reactions', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, emoji = null } = req.query;

    const result = await PostReaction.getPostReactions(id, {
      page: parseInt(page),
      limit: parseInt(limit),
      emoji
    });

    res.json(result);

  } catch (error) {
    console.error('Get reactions error:', error);
    res.status(500).json({ error: 'Failed to get reactions' });
  }
});

/**
 * GET /api/posts/user/:userId - Get user's posts
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const requesterId = req.user?.id;
    const options = req.query;

    // Users can only see their own posts or public posts
    if (requesterId !== parseInt(userId)) {
      // Filter to only show posts from public channels
      const userPosts = await postService.getUserPosts(userId, options);
      const publicPosts = [];

      for (const post of userPosts.posts) {
        const channel = await Channel.findByPk(post.channelId);
        if (channel && channel.type === 'public') {
          publicPosts.push(post);
        }
      }

      res.json({
        posts: publicPosts,
        pagination: userPosts.pagination
      });
    } else {
      const result = await postService.getUserPosts(userId, options);
      res.json(result);
    }

  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({ error: 'Failed to get user posts' });
  }
});

/**
 * GET /api/posts/search - Search posts
 */
router.get('/search', async (req, res) => {
  try {
    const { q: query } = req.query;
    const userId = req.user?.id;
    const options = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const result = await postService.searchPosts(query, userId, options);
    res.json(result);

  } catch (error) {
    console.error('Search posts error:', error);
    res.status(500).json({ error: 'Failed to search posts' });
  }
});

/**
 * GET /api/posts/:id/stats - Get post statistics
 */
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const stats = await postService.getPostStats(id, userId);
    res.json(stats);

  } catch (error) {
    console.error('Get post stats error:', error);
    if (error.message.includes('permission') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get post statistics' });
  }
});

/**
 * GET /api/posts/:id/comments - Get comments for a post
 */
router.get('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'ASC' } = req.query;

    const result = await PostComment.getPostComments(id, {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder
    });

    res.json(result);

  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

/**
 * POST /api/posts/:id/comments - Add comment to post
 */
router.post('/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { content, parentId = null, mentions = [], attachments = [] } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    // Check if post exists and allows comments
    const post = await Post.findByPk(id);
    if (!post || !post.allowComments) {
      return res.status(404).json({ error: 'Post not found or comments not allowed' });
    }

    // Check if user can access channel
    const canAccess = await require('../services/channelPrivacyService').channelPrivacyService.canAccessChannel(post.channelId, userId);
    if (!canAccess.canAccess) {
      return res.status(403).json({ error: canAccess.reason });
    }

    const comment = await PostComment.create({
      postId: id,
      authorId: userId,
      content: content.trim(),
      parentId,
      mentions,
      attachments
    });

    // Emit Socket.IO event
    const io = require('../socket').io;
    io.emit('new_comment', {
      postId: id,
      commentId: comment.id,
      author: {
        id: userId,
        name: (await User.findByPk(userId))?.name
      }
    });

    res.status(201).json({
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        parentId: comment.parentId,
        mentions: comment.mentions,
        attachments: comment.attachments,
        createdAt: comment.createdAt
      }
    });

  } catch (error) {
    console.error('Add comment error:', error);
    if (error.message.includes('access')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

/**
 * PUT /api/posts/:postId/comments/:commentId - Update comment
 */
router.put('/:postId/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const userId = req.user.id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const comment = await PostComment.findByPk(commentId);
    if (!comment || comment.postId !== parseInt(postId)) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const canEdit = await comment.canEdit(userId);
    if (!canEdit) {
      return res.status(403).json({ error: 'You do not have permission to edit this comment' });
    }

    await comment.edit(content.trim(), userId);

    res.json({
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        isEdited: comment.isEdited,
        editedAt: comment.editedAt,
        updatedAt: comment.updatedAt
      }
    });

  } catch (error) {
    console.error('Update comment error:', error);
    if (error.message.includes('permission') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

/**
 * DELETE /api/posts/:postId/comments/:commentId - Delete comment
 */
router.delete('/:postId/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const userId = req.user.id;

    const comment = await PostComment.findByPk(commentId);
    if (!comment || comment.postId !== parseInt(postId)) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const canDelete = await comment.canDelete(userId);
    if (!canDelete) {
      return res.status(403).json({ error: 'You do not have permission to delete this comment' });
    }

    await comment.softDelete(userId);

    res.json({ success: true });

  } catch (error) {
    console.error('Delete comment error:', error);
    if (error.message.includes('permission') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

module.exports = router;
