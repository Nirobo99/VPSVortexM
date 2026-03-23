const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const UserFunc = require('../models/User');
const authMiddleware = require('../middleware/auth');

// Инициализируем модель User
const User = UserFunc(sequelize);

// Middleware для проверки админских прав
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  next();
};

// Получение списка всех пользователей с пагинацией
router.get('/users', authMiddleware, isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { count, rows: users } = await User.findAndCountAll({
      attributes: [
        'id', 'email', 'name', 'role', 'birthYear', 
        'avatar', 'isPublic', 'theme', 'createdAt', 'updatedAt'
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalUsers: count,
        limit
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Получение детальной информации о пользователе
router.get('/users/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findByPk(userId, {
      attributes: { exclude: ['passwordHash'] }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ error: 'Failed to get user details' });
  }
});

// Обновление роли пользователя
router.put('/users/:id/role', authMiddleware, isAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { role } = req.body;
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be user or admin' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Предотвращаем изменение собственной роли
    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    await user.update({ role });

    res.json({
      message: 'User role updated successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Получение статистики
router.get('/stats', authMiddleware, isAdmin, async (req, res) => {
  try {
    const totalUsers = await User.count();
    const adminUsers = await User.count({ where: { role: 'admin' } });
    const publicProfiles = await User.count({ where: { isPublic: true } });
    const privateProfiles = await User.count({ where: { isPublic: false } });

    // Получаем пользователей по месяцам регистрации
    const usersByMonth = await User.findAll({
      attributes: [
        [sequelize.fn('YEAR', sequelize.col('createdAt')), 'year'],
        [sequelize.fn('MONTH', sequelize.col('createdAt')), 'month'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: [
        sequelize.fn('YEAR', sequelize.col('createdAt')),
        sequelize.fn('MONTH', sequelize.col('createdAt'))
      ],
      order: [
        [sequelize.fn('YEAR', sequelize.col('createdAt')), 'DESC'],
        [sequelize.fn('MONTH', sequelize.col('createdAt')), 'DESC']
      ]
    });

    res.json({
      totalUsers,
      adminUsers,
      publicProfiles,
      privateProfiles,
      usersByMonth: usersByMonth.map(item => ({
        year: item.dataValues.year,
        month: item.dataValues.month,
        count: parseInt(item.dataValues.count)
      }))
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

module.exports = router;
