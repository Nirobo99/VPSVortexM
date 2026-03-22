require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');

const PORT = process.env.PORT || 3001;

// Синхронизация с базой данных перед запуском сервера
sequelize.sync({ alter: true })
  .then(() => {
    console.log('Database synced successfully');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database sync error:', err);
    console.log('Starting server without database...');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT} (without database)`);
    });
  });