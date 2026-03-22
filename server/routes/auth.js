const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const redisClient = require('../utils/redis');
const { User } = require('../models');
const router = express.Router();

// Объект соответствия годов животным (китайский календарь)
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

// Регистрация
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, birthYear, animalAnswer, mathAnswer } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    // Проверка математического ответа (2+2*2 = 6)
    if (mathAnswer !== '6') {
      // Блокировка в Redis на 24 часа
      await redisClient.setEx(`block:email:${email}`, 24 * 60 * 60, '1');
      await redisClient.setEx(`block:ip:${clientIp}`, 24 * 60 * 60, '1');
      
      return res.status(400).json({ 
        error: 'Incorrect math answer',
        blocked: true,
        message: 'IP and email blocked for 24 hours'
      });
    }

    // Проверка ответа про животное
    const correctAnimal = animalYears[birthYear];
    if (animalAnswer !== correctAnimal) {
      // Блокировка в Redis на 24 часа
      await redisClient.setEx(`block:email:${email}`, 24 * 60 * 60, '1');
      await redisClient.setEx(`block:ip:${clientIp}`, 24 * 60 * 60, '1');
      
      return res.status(400).json({ 
        error: 'Incorrect animal answer',
        blocked: true,
        message: 'IP and email blocked for 24 hours'
      });
    }

    // Проверка существования пользователя
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Хеширование пароля
    const passwordHash = await bcrypt.hash(password, 10);

    // Создание пользователя
    const user = await User.create({
      email,
      passwordHash,
      name,
      birthYear
    });

    res.status(201).json({ 
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        birthYear: user.birthYear
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Вход
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Поиск пользователя
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Проверка пароля
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Создание JWT токена
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
