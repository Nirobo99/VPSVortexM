import React, { useState } from 'react';
import { authAPI } from '../services/api';
import { useNavigate, useLocation } from 'react-router-dom';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [rateLimited, setRateLimited] = useState(false);

  React.useEffect(() => {
    if (location.state?.message) {
      setMessage(location.state.message);
    }
  }, [location]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await authAPI.login(formData.email, formData.password);
      localStorage.setItem('token', response.token);
      navigate('/profile');
    } catch (error) {
      if (error.response?.status === 429) {
        setRateLimited(true);
        setMessage('Слишком много попыток входа. Попробуйте через 15 минут.');
      } else {
        setMessage(error.response?.data?.error || 'Ошибка входа');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <h2>Вход</h2>
      
      {message && <div className="message">{message}</div>}

      {rateLimited && (
        <div className="rate-limit-warning">
          <p>⚠️ Слишком много попыток входа</p>
          <p>Попробуйте снова через 15 минут</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label>Email:</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            disabled={loading || rateLimited}
          />
        </div>

        <div className="form-group">
          <label>Пароль:</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            disabled={loading || rateLimited}
          />
        </div>

        <button type="submit" disabled={loading || rateLimited}>
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </form>

      <div className="register-link">
        Нет аккаунта? <a href="/register">Зарегистрируйтесь</a>
      </div>
    </div>
  );
};

export default Login;
