import React, { useState, useEffect } from 'react';
import { usersAPI } from '../services/api';

const Profile = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    avatar: '',
    isPublic: true,
    theme: 'light',
    customColors: null
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const userData = await usersAPI.getMe();
      setUser(userData);
      setFormData({
        name: userData.name,
        bio: userData.bio || '',
        avatar: userData.avatar || '',
        isPublic: userData.isPublic,
        theme: userData.theme || 'light',
        customColors: userData.customColors
      });
    } catch (error) {
      setMessage('Ошибка загрузки профиля');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await usersAPI.updateProfile(formData);
      await loadProfile();
      setEditing(false);
      setMessage('Профиль успешно обновлен!');
    } catch (error) {
      setMessage('Ошибка обновления профиля');
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div className="profile-container">
      <h2>Мой профиль</h2>
      
      {message && <div className="message">{message}</div>}

      <div className="profile-info">
        <img src={user.avatar} alt="Аватар" className="avatar" />
        <div className="user-details">
          <h3>{user.name}</h3>
          <p>Email: {user.email}</p>
          <p>Год рождения: {user.birthYear}</p>
          <p>Профиль: {user.isPublic ? 'Публичный' : 'Приватный'}</p>
          <p>Тема: {user.theme}</p>
        </div>
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="profile-form">
          <div className="form-group">
            <label>Имя:</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>О себе:</label>
            <textarea
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              maxLength="1000"
            />
          </div>

          <div className="form-group">
            <label>URL аватара:</label>
            <input
              type="text"
              name="avatar"
              value={formData.avatar}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                name="isPublic"
                checked={formData.isPublic}
                onChange={handleChange}
              />
              Публичный профиль
            </label>
          </div>

          <div className="form-group">
            <label>Тема:</label>
            <select
              name="theme"
              value={formData.theme}
              onChange={handleChange}
            >
              <option value="light">Светлая</option>
              <option value="dark">Тёмная</option>
              <option value="custom">Кастомная</option>
            </select>
          </div>

          <div className="form-actions">
            <button type="submit">Сохранить</button>
            <button type="button" onClick={() => setEditing(false)}>
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <div className="profile-actions">
          <button onClick={() => setEditing(true)}>Редактировать профиль</button>
        </div>
      )}
    </div>
  );
};

export default Profile;
