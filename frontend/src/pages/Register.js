import React, { useState } from 'react';
import { authAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

const animalYears = {
  1990: 'Лошадь', 1991: 'Овца', 1992: 'Обезьяна', 1993: 'Петух',
  1994: 'Собака', 1995: 'Свинья', 1996: 'Крыса', 1997: 'Бык',
  1998: 'Тигр', 1999: 'Кролик', 2000: 'Дракон', 2001: 'Змея',
  2002: 'Лошадь', 2003: 'Овца', 2004: 'Обезьяна', 2005: 'Петух',
  2006: 'Собака', 2007: 'Свинья', 2008: 'Крыса', 2009: 'Бык',
  2010: 'Тигр', 2011: 'Кролик', 2012: 'Дракон', 2013: 'Змея',
  2014: 'Лошадь', 2015: 'Овца', 2016: 'Обезьяна', 2017: 'Петух',
  2018: 'Собака', 2019: 'Свинья', 2020: 'Крыса', 2021: 'Бык',
  2022: 'Тигр', 2023: 'Кролик', 2024: 'Дракон', 2025: 'Змея'
};

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    birthYear: '',
    animalAnswer: '',
    mathAnswer: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [blocked, setBlocked] = useState(false);

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
      await authAPI.register(formData);
      navigate('/login', { 
        state: { message: 'Регистрация успешна! Теперь вы можете войти.' }
      });
    } catch (error) {
      if (error.response?.data?.blocked) {
        setBlocked(true);
        setMessage('Регистрация заблокирована на 24 часа из-за неверных ответов');
      } else {
        setMessage(error.response?.data?.error || 'Ошибка регистрации');
      }
    } finally {
      setLoading(false);
    }
  };

  const getAnimalHint = (year) => {
    return animalYears[year] ? `Подсказка: ${animalYears[year]}` : '';
  };

  if (blocked) {
    return (
      <div className="register-container blocked">
        <h2>Регистрация заблокирована</h2>
        <p>Ваша регистрация заблокирована на 24 часа из-за неверных ответов на контрольные вопросы.</p>
        <p>Попробуйте снова позже.</p>
      </div>
    );
  }

  return (
    <div className="register-container">
      <h2>Регистрация</h2>
      
      {message && <div className="message">{message}</div>}

      <form onSubmit={handleSubmit} className="register-form">
        <div className="form-group">
          <label>Email:</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
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
            minLength="6"
          />
        </div>

        <div className="form-group">
          <label>Имя:</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            minLength="2"
          />
        </div>

        <div className="form-group">
          <label>Год рождения:</label>
          <select
            name="birthYear"
            value={formData.birthYear}
            onChange={handleChange}
            required
          >
            <option value="">Выберите год</option>
            {Object.keys(animalYears).map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          {formData.birthYear && (
            <small className="hint">{getAnimalHint(formData.birthYear)}</small>
          )}
        </div>

        <div className="form-group">
          <label>Какое животное соответствует вашему году рождения?</label>
          <input
            type="text"
            name="animalAnswer"
            value={formData.animalAnswer}
            onChange={handleChange}
            required
            placeholder="Например: Тигр"
          />
        </div>

        <div className="form-group">
          <label>Решите пример: 2 + 2 * 2 = ?</label>
          <input
            type="text"
            name="mathAnswer"
            value={formData.mathAnswer}
            onChange={handleChange}
            required
            placeholder="Введите ответ"
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Регистрация...' : 'Зарегистрироваться'}
        </button>
      </form>

      <div className="login-link">
        Уже есть аккаунт? <a href="/login">Войдите</a>
      </div>
    </div>
  );
};

export default Register;
