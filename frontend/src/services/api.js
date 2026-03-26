import axios from 'axios';

// Базовый URL API
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Создаем экземпляр axios
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Перехватчик для добавления JWT токена
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Перехватчик для обработки ошибок
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API для аутентификации
export const authAPI = {
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },
};

// API для пользователей
export const usersAPI = {
  // Получение данных текущего пользователя
  getMe: async () => {
    const response = await api.get('/users/me');
    return response.data;
  },

  // Обновление профиля
  updateProfile: async (profileData) => {
    const response = await api.put('/users/profile', profileData);
    return response.data;
  },

  // Получение данных другого пользователя
  getUser: async (userId) => {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  },

  // Чёрный список
  blockUser: async (userId) => {
    const response = await api.post(`/users/block/${userId}`);
    return response.data;
  },

  unblockUser: async (userId) => {
    const response = await api.delete(`/users/block/${userId}`);
    return response.data;
  },

  getBlockedUsers: async () => {
    const response = await api.get('/users/block/list');
    return response.data;
  },
};

// API для админов
export const adminAPI = {
  // Получение списка пользователей
  getUsers: async (page = 1, limit = 10) => {
    const response = await api.get(`/admin/users?page=${page}&limit=${limit}`);
    return response.data;
  },

  // Получение детальной информации о пользователе
  getUserDetails: async (userId) => {
    const response = await api.get(`/admin/users/${userId}`);
    return response.data;
  },

  // Обновление роли пользователя
  updateUserRole: async (userId, role) => {
    const response = await api.put(`/admin/users/${userId}/role`, { role });
    return response.data;
  },

  // Получение статистики
  getStats: async () => {
    const response = await api.get('/admin/stats');
    return response.data;
  },
};

// API для сообщений
export const messagesAPI = {
  // Получение истории сообщений с пользователем
  getMessages: async (userId, page = 1, limit = 50) => {
    const response = await api.get(`/messages/${userId}?page=${page}&limit=${limit}`);
    return response.data;
  },

  // Отправка нового сообщения
  sendMessage: async (messageData) => {
    const response = await api.post('/messages', messageData);
    return response.data;
  },

  // Редактирование сообщения
  editMessage: async (messageId, text) => {
    const response = await api.put(`/messages/${messageId}`, { text });
    return response.data;
  },

  // Удаление сообщения
  deleteMessage: async (messageId) => {
    const response = await api.delete(`/messages/${messageId}`);
    return response.data;
  },

  // Добавление/удаление реакции
  toggleReaction: async (messageId, emoji) => {
    const response = await api.post(`/messages/${messageId}/reactions`, { emoji });
    return response.data;
  },

  // Закрепление сообщения
  pinMessage: async (messageId) => {
    const response = await api.post(`/messages/${messageId}/pin`);
    return response.data;
  },

  // Открепление сообщения
  unpinMessage: async (messageId) => {
    const response = await api.delete(`/messages/${messageId}/pin`);
    return response.data;
  }
};

// API для диалогов
export const dialogsAPI = {
  // Получение списка диалогов
  getDialogs: async (page = 1, limit = 20) => {
    const response = await api.get(`/dialogs?page=${page}&limit=${limit}`);
    return response.data;
  },

  // Поиск сообщений в диалоге
  searchInDialog: async (userId, query, page = 1, limit = 20) => {
    const response = await api.get(`/dialogs/${userId}/messages/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
    return response.data;
  },

  // Глобальный поиск сообщений
  searchMessages: async (query, withUserId = null, page = 1, limit = 20) => {
    let url = `/messages/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`;
    if (withUserId) {
      url += `&withUserId=${withUserId}`;
    }
    const response = await api.get(url);
    return response.data;
  },

  // Отметить все сообщения в диалоге как прочитанные
  markDialogAsRead: async (userId) => {
    const response = await api.post(`/dialogs/${userId}/read`);
    return response.data;
  }
};

// API для загрузки файлов
export const uploadAPI = {
  // Загрузка нескольких файлов
  uploadFiles: async (files) => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    
    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Загрузка одного файла
  uploadFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/upload/single', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Удаление файла
  deleteFile: async (filename) => {
    const response = await api.delete(`/upload/${filename}`);
    return response.data;
  }
};
