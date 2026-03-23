const { DataTypes, Sequelize } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'password_hash'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  avatar: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'default-avatar.png'
  },
  birthYear: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'birth_year',
    validate: {
      min: 1900,
      max: new Date().getFullYear()
    }
  },
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    defaultValue: 'user',
    allowNull: false
  },
  stickerLimit: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
    field: 'sticker_limit'
  },
  invisible: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  invisibleExpiry: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'invisible_expiry'
  },
  hidden: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  anonymous: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_public'
  },
  theme: {
    type: DataTypes.STRING,
    defaultValue: 'light'
  },
  customColors: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
    field: 'custom_colors'
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Ассоциации
User.associate = (models) => {
  User.hasMany(models.BlockedUser, { 
    as: 'blockedUsers', 
    foreignKey: 'user_id' 
  });
  User.hasMany(models.BlockedUser, { 
    as: 'blockedByUsers', 
    foreignKey: 'blocked_user_id' 
  });
};

return User;
};
