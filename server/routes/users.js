const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const UserFunc = require('../models/User');
const BlockedUserFunc = require('../models/BlockedUser');
const authMiddleware = require('../middleware/auth');

// Инициализируем модели
const User = UserFunc(sequelize);
const BlockedUser = BlockedUserFunc(sequelize);

// Получение данных текущего пользователя
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['passwordHash'] }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Обновление данных профиля
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, bio, avatar, isPublic, theme, customColors } = req.body;
    
    // Валидация входных данных
    const updateData = {};
    
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters long' });
      }
      updateData.name = name.trim();
    }
    
    if (bio !== undefined) {
      if (typeof bio !== 'string' || bio.length > 1000) {
        return res.status(400).json({ error: 'Bio must be less than 1000 characters' });
      }
      updateData.bio = bio.trim();
    }
    
    if (avatar !== undefined) {
      if (typeof avatar !== 'string' || avatar.trim().length === 0) {
        return res.status(400).json({ error: 'Avatar URL is required' });
      }
      updateData.avatar = avatar.trim();
    }
    
    if (isPublic !== undefined) {
      if (typeof isPublic !== 'boolean') {
        return res.status(400).json({ error: 'isPublic must be a boolean' });
      }
      updateData.isPublic = isPublic;
    }
    
    if (theme !== undefined) {
      const validThemes = ['light', 'dark', 'custom'];
      if (!validThemes.includes(theme)) {
        return res.status(400).json({ error: 'Invalid theme. Must be light, dark, or custom' });
      }
      updateData.theme = theme;
    }
    
    if (customColors !== undefined) {
      if (customColors !== null && typeof customColors !== 'object') {
        return res.status(400).json({ error: 'customColors must be an object or null' });
      }
      updateData.customColors = customColors;
    }
    
    // Обновление пользователя
    const [updatedRowsCount] = await User.update(updateData, {
      where: { id: req.user.id },
      returning: true
    });
    
    if (updatedRowsCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Получаем обновленные данные
    const updatedUser = await User.findByPk(req.user.id, {
      attributes: { exclude: ['passwordHash'] }
    });
    
    res.json(updatedUser);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Получение публичной информации о пользователе
router.get('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Преобразуем данные в нужный формат
    const userData = user.toJSON();
    
    // Если профиль приватный и пользователь не является владельцем
    if (!userData.isPublic) {
      // Проверяем, является ли запрашивающий владельцем профиля
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded.id !== userId) {
            // Возвращаем только базовую информацию для приватного профиля
            return res.json({
              id: userData.id,
              name: userData.name,
              avatar: userData.avatar,
              isPrivate: true
            });
          }
        } catch (jwtError) {
          // Токен невалидный, возвращаем базовую информацию
          return res.json({
            id: userData.id,
            name: userData.name,
            avatar: userData.avatar,
            isPrivate: true
          });
        }
      } else {
        // Нет токена, возвращаем базовую информацию
        return res.json({
          id: userData.id,
          name: userData.name,
          avatar: userData.avatar,
          isPrivate: true
        });
      }
    }
    
    // Публичный профиль - возвращаем всю информацию
    res.json(userData);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// API для чёрного списка

// Добавить пользователя в чёрный список
router.post('/block/:userId', authMiddleware, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const currentUserId = req.user.id;
    
    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    if (targetUserId === currentUserId) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }
    
    // Проверяем, существует ли пользователь
    const targetUser = await User.findByPk(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Проверяем, не заблокирован ли уже этот пользователь
    const existingBlock = await BlockedUser.findOne({
      where: {
        userId: currentUserId,
        blockedUserId: targetUserId
      }
    });
    
    if (existingBlock) {
      return res.status(400).json({ error: 'User already blocked' });
    }
    
    // Создаем блокировку
    await BlockedUser.create({
      user_id: currentUserId,
      blocked_user_id: targetUserId
    });
    
    res.json({ message: 'User blocked successfully' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// Удалить пользователя из чёрного списка
router.delete('/block/:userId', authMiddleware, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const currentUserId = req.user.id;
    
    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    // Удаляем блокировку
    const deletedCount = await BlockedUser.destroy({
      where: {
        user_id: currentUserId,
        blocked_user_id: targetUserId
      }
    });
    
    if (deletedCount === 0) {
      return res.status(404).json({ error: 'Block not found' });
    }
    
    res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// Получить список заблокированных пользователей
router.get('/block/list', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    
    const blockedUsers = await BlockedUser.findAll({
      where: { user_id: currentUserId },
      include: [{
        model: User,
        as: 'blockedUser'
      }]
    });
    
    const formattedList = blockedUsers.map(block => ({
      id: block.blockedUser.id,
      name: block.blockedUser.name,
      avatar: block.blockedUser.avatar,
      blockedAt: block.createdAt
    }));
    
    res.json(formattedList);
  } catch (error) {
    console.error('Get blocked list error:', error);
    res.status(500).json({ error: 'Failed to get blocked list' });
  }
});

module.exports = router;
