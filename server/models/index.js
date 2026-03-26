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

// Load models
const User = require('./User');
const BlockedUser = require('./BlockedUser');
const Message = require('./Message');
const Attachment = require('./Attachment');
const Reaction = require('./Reaction');
const PinnedMessage = require('./PinnedMessage');
const UserIPLog = require('./UserIPLog');
const AdminLog = require('./AdminLog');
const Call = require('./Call');
const CallParticipant = require('./CallParticipant');
const CallRecording = require('./CallRecording');

// Setup associations
const models = {
  User,
  BlockedUser,
  Message,
  Attachment,
  Reaction,
  PinnedMessage,
  UserIPLog,
  AdminLog,
  Call,
  CallParticipant,
  CallRecording
};

Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Export sequelize instance and Sequelize class
module.exports = { sequelize, Sequelize, ...models };