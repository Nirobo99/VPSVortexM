import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { messagesAPI, dialogsAPI } from '../services/api';
import './Chat.css';

const Chat = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const [typing, setTyping] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

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
      // Join chat room
      newSocket.emit('join_chat', { userId: parseInt(userId) });
    });

    newSocket.on('new_message', (message) => {
      setMessages(prev => [...prev, message]);
      scrollToBottom();
    });

    newSocket.on('message_updated', (message) => {
      setMessages(prev => 
        prev.map(msg => msg.id === message.id ? message : msg)
      );
    });

    newSocket.on('message_deleted', ({ messageId }) => {
      setMessages(prev => 
        prev.filter(msg => msg.id !== messageId)
      );
    });

    newSocket.on('message_read', ({ messageId }) => {
      setMessages(prev => 
        prev.map(msg => msg.id === messageId ? { ...msg, status: 'read' } : msg)
      );
    });

    newSocket.on('user_typing', ({ userId: typingUserId, isTyping }) => {
      if (typingUserId === parseInt(userId)) {
        setUserTyping(isTyping);
      }
    });

    newSocket.on('reaction_added', (reaction) => {
      setMessages(prev => 
        prev.map(msg => 
          msg.id === reaction.messageId 
            ? { ...msg, reactions: [...(msg.reactions || []), reaction] }
            : msg
        )
      );
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('leave_chat', { userId: parseInt(userId) });
      newSocket.disconnect();
    };
  }, [userId, navigate]);

  useEffect(() => {
    loadMessages();
    markAsRead();
  }, [userId]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await messagesAPI.getMessages(userId);
      setMessages(response.messages || []);
      setPinnedMessages(response.pinnedMessages || []);
      scrollToBottom();
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    try {
      await dialogsAPI.markDialogAsRead(userId);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      const messageData = {
        receiverId: parseInt(userId),
        text: newMessage.trim(),
        type: 'text'
      };

      const response = await messagesAPI.sendMessage(messageData);
      setMessages(prev => [...prev, response]);
      setNewMessage('');
      scrollToBottom();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    
    if (!typing) {
      setTyping(true);
      socket?.emit('typing', { userId: parseInt(userId) });
    }

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
      socket?.emit('stop_typing', { userId: parseInt(userId) });
    }, 1000);
  };

  const handleEditMessage = async (messageId, newText) => {
    try {
      await messagesAPI.editMessage(messageId, newText);
    } catch (error) {
      console.error('Error editing message:', error);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      await messagesAPI.deleteMessage(messageId);
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  const handleToggleReaction = async (messageId, emoji) => {
    try {
      await messagesAPI.toggleReaction(messageId, emoji);
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  };

  const handlePinMessage = async (messageId) => {
    try {
      await messagesAPI.pinMessage(messageId);
    } catch (error) {
      console.error('Error pinning message:', error);
    }
  };

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent':
        return '✓';
      case 'delivered':
        return '✓✓';
      case 'read':
        return <span style={{ color: '#4FC3F7' }}>✓✓</span>;
      default:
        return '';
    }
  };

  if (loading) {
    return <div className="chat-loading">Загрузка...</div>;
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h3>Чат с пользователем #{userId}</h3>
        {userTyping && <span className="typing-indicator">печатает...</span>}
      </div>

      {/* Pinned Messages */}
      {pinnedMessages.length > 0 && (
        <div className="pinned-messages">
          <h4>Закрепленные сообщения</h4>
          {pinnedMessages.map(message => (
            <div key={message.id} className="pinned-message">
              <p>{message.text}</p>
              <small>{formatTime(message.createdAt)}</small>
            </div>
          ))}
        </div>
      )}

      <div className="messages-container">
        {messages.map(message => (
          <div
            key={message.id}
            className={`message ${message.senderId === parseInt(localStorage.getItem('userId')) ? 'sent' : 'received'}`}
          >
            <div className="message-content">
              <p>{message.text}</p>
              {message.attachments && message.attachments.map(attachment => (
                <div key={attachment.id} className="attachment">
                  {attachment.type === 'image' ? (
                    <img src={attachment.url} alt="Attachment" />
                  ) : (
                    <a href={attachment.url} download>{attachment.originalName}</a>
                  )}
                </div>
              ))}
              <div className="message-info">
                <span className="time">{formatTime(message.createdAt)}</span>
                <span className="status">{getStatusIcon(message.status)}</span>
                {message.isEdited && <span className="edited">изменено</span>}
              </div>
              {message.reactions && message.reactions.length > 0 && (
                <div className="reactions">
                  {message.reactions.map(reaction => (
                    <span key={reaction.id} className="reaction">
                      {reaction.emoji}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="message-actions">
              <button onClick={() => handleToggleReaction(message.id, '👍')}>👍</button>
              <button onClick={() => handleToggleReaction(message.id, '❤️')}>❤️</button>
              <button onClick={() => handlePinMessage(message.id)}>📌</button>
              {message.senderId === parseInt(localStorage.getItem('userId')) && (
                <>
                  <button onClick={() => handleEditMessage(message.id, prompt('Новое сообщение:', message.text))}>
                    ✏️
                  </button>
                  <button onClick={() => handleDeleteMessage(message.id)}>🗑️</button>
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="message-input-form">
        <input
          type="text"
          value={newMessage}
          onChange={handleTyping}
          placeholder="Введите сообщение..."
          className="message-input"
        />
        <button type="submit" className="send-button">
          Отправить
        </button>
      </form>
    </div>
  );
};

export default Chat;
