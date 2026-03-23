const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Загрузка моделей
const User = require('./User');
const BlockedUser = require('./BlockedUser');

// Установка ассоциаций
const models = {
  User,
  BlockedUser
};

Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Экспортируем объект sequelize и сам класс Sequelize
module.exports = { sequelize, Sequelize, ...models };