const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const messageRoutes = require('./routes/messages');
const uploadRoutes = require('./routes/upload');
const dialogRoutes = require('./routes/dialogs');
const callRoutes = require('./routes/calls');
const channelRoutes = require('./routes/channels');
const postRoutes = require('./routes/posts');
const broadcastRoutes = require('./routes/broadcasts');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

// Маршруты
app.get('/', (req, res) => {
  res.json({ message: 'Server is running!' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/dialogs', dialogRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/broadcasts', broadcastRoutes);

module.exports = app;