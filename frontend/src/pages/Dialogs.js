import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { dialogsAPI } from '../services/api';
import './Dialogs.css';

const Dialogs = () => {
  const [dialogs, setDialogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    // Initialize Socket.IO
    const newSocket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001', {
      auth: {
        token: token
      }
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('user_online', ({ userId }) => {
      setOnlineUsers(prev => new Set([...prev, userId]));
    });

    newSocket.on('user_offline', ({ userId }) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    });

    newSocket.on('new_message', (message) => {
      // Update dialogs list when new message arrives
      loadDialogs();
    });

    newSocket.on('messages_read', ({ userId, targetUserId }) => {
      // Update unread count when messages are read
      if (userId === parseInt(localStorage.getItem('userId'))) {
        loadDialogs();
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [navigate]);

  useEffect(() => {
    loadDialogs();
  }, []);

  const loadDialogs = async () => {
    try {
      setLoading(true);
      const response = await dialogsAPI.getDialogs();
      setDialogs(response.dialogs || []);
    } catch (error) {
      console.error('Error loading dialogs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDialogClick = (userId) => {
    navigate(`/chat/${userId}`);
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString('ru-RU', {
        weekday: 'short'
      });
    } else {
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit'
      });
    }
  };

  const truncateMessage = (text, maxLength = 50) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return <div className="dialogs-loading">Загрузка диалогов...</div>;
  }

  return (
    <div className="dialogs-container">
      <div className="dialogs-header">
        <h2>Сообщения</h2>
        <button onClick={loadDialogs} className="refresh-button">
          🔄
        </button>
      </div>

      {dialogs.length === 0 ? (
        <div className="no-dialogs">
          <div className="no-dialogs-icon">💬</div>
          <h3>Нет диалогов</h3>
          <p>Начните общение с другими пользователями</p>
        </div>
      ) : (
        <div className="dialogs-list">
          {dialogs.map(dialog => (
            <div
              key={dialog.user.id}
              className="dialog-item"
              onClick={() => handleDialogClick(dialog.user.id)}
            >
              <div className="dialog-avatar">
                {dialog.user.avatar ? (
                  <img 
                    src={dialog.user.avatar} 
                    alt={dialog.user.name}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className="avatar-fallback" style={{ display: dialog.user.avatar ? 'none' : 'flex' }}>
                  {getInitials(dialog.user.name)}
                </div>
                {onlineUsers.has(dialog.user.id) && (
                  <div className="online-indicator"></div>
                )}
              </div>

              <div className="dialog-content">
                <div className="dialog-header-row">
                  <h3 className="dialog-name">{dialog.user.name}</h3>
                  <span className="dialog-time">
                    {formatTime(dialog.lastMessage.createdAt)}
                  </span>
                </div>

                <div className="dialog-message-row">
                  <p className="dialog-message">
                    {dialog.lastMessage.senderId === parseInt(localStorage.getItem('userId')) && (
                      <span className="message-sender">Вы: </span>
                    )}
                    {dialog.lastMessage.type === 'text' 
                      ? truncateMessage(dialog.lastMessage.text)
                      : `${dialog.lastMessage.type === 'image' ? '📷' : 
                         dialog.lastMessage.type === 'voice' ? '🎤' : 
                         dialog.lastMessage.type === 'video' ? '🎥' : '📎'} Вложение`
                    }
                  </p>
                  {dialog.unreadCount > 0 && (
                    <span className="unread-count">
                      {dialog.unreadCount > 99 ? '99+' : dialog.unreadCount}
                    </span>
                  )}
                </div>

                {dialog.lastMessage.isEdited && (
                  <span className="edited-indicator">изменено</span>
                )}
              </div>

              {dialog.isBlocked && (
                <div className="blocked-indicator">
                  <span>🚫</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dialogs;
