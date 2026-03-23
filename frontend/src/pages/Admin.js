import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';

const Admin = () => {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadUsers();
    loadStats();
  }, [currentPage]);

  const loadUsers = async () => {
    try {
      const data = await adminAPI.getUsers(currentPage, 10);
      setUsers(data.users);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      setMessage('Ошибка загрузки пользователей');
    }
  };

  const loadStats = async () => {
    try {
      const data = await adminAPI.getStats();
      setStats(data);
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await adminAPI.updateUserRole(userId, newRole);
      await loadUsers();
      setMessage('Роль пользователя обновлена');
    } catch (error) {
      setMessage('Ошибка обновления роли');
    }
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div className="admin-container">
      <h2>Админ-панель</h2>
      
      {message && <div className="message">{message}</div>}

      {stats && (
        <div className="stats-section">
          <h3>Статистика</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <h4>Всего пользователей</h4>
              <p>{stats.totalUsers}</p>
            </div>
            <div className="stat-card">
              <h4>Администраторы</h4>
              <p>{stats.adminUsers}</p>
            </div>
            <div className="stat-card">
              <h4>Публичные профили</h4>
              <p>{stats.publicProfiles}</p>
            </div>
            <div className="stat-card">
              <h4>Приватные профили</h4>
              <p>{stats.privateProfiles}</p>
            </div>
          </div>
        </div>
      )}

      <div className="users-section">
        <h3>Пользователи</h3>
        <div className="users-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Имя</th>
                <th>Роль</th>
                <th>Год рождения</th>
                <th>Профиль</th>
                <th>Тема</th>
                <th>Дата регистрации</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.email}</td>
                  <td>{user.name}</td>
                  <td>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="role-select"
                    >
                      <option value="user">Пользователь</option>
                      <option value="admin">Администратор</option>
                    </select>
                  </td>
                  <td>{user.birthYear}</td>
                  <td>{user.isPublic ? 'Публичный' : 'Приватный'}</td>
                  <td>{user.theme}</td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      onClick={() => window.location.href = `/users/${user.id}`}
                      className="view-btn"
                    >
                      Просмотр
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              ←
            </button>
            <span>
              Страница {currentPage} из {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
