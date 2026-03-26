require('dotenv').config();
const http = require('http');
const app = require('./app');
const { sequelize } = require('./models');
const { initializeSocketIO } = require('./socket');

const PORT = process.env.PORT || 3001;

// Create HTTP server for Socket.IO
const server = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocketIO(server);

// Синхронизация с базой данных перед запуском сервера
sequelize.sync({ alter: true })
  .then(() => {
    console.log('Database synced successfully');
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Socket.IO server initialized`);
    });
  })
  .catch(err => {
    console.error('Database sync error:', err);
    console.log('Starting server without database...');
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT} (without database)`);
    });
  });