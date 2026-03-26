const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const redisClient = require('../utils/redis');
const { User } = require('../models');
const { getClientIP, getIPInfo } = require('../utils/ipHelper');
const router = express.Router();

// Middleware for brute force protection with VPN support
const loginRateLimit = async (req, res, next) => {
  try {
    const ipInfo = getIPInfo(req);
    const clientIP = ipInfo.realIP;
    
    // Rate limit by both IP and email combination for VPN users
    const ipKey = `login:attempts:ip:${clientIP}`;
    const { email } = req.body;
    const emailKey = email ? `login:attempts:email:${email}` : null;
    
    const [ipAttempts, emailAttempts] = await Promise.all([
      redisClient.get(ipKey),
      emailKey ? redisClient.get(emailKey) : Promise.resolve(null)
    ]);
    
    // Block if either IP or email exceeds limit
    if ((ipAttempts && parseInt(ipAttempts) >= 5) || 
        (emailAttempts && parseInt(emailAttempts) >= 5)) {
      return res.status(429).json({
        error: 'Too many login attempts',
        message: 'Please try again later',
        blockedBy: ipAttempts >= 5 ? 'ip' : 'email'
      });
    }
    
    // Increment attempt counters
    await Promise.all([
      redisClient.incr(ipKey),
      emailKey ? redisClient.incr(emailKey) : Promise.resolve(null)
    ]);
    
    // Set TTL for 15 minutes
    await Promise.all([
      redisClient.expire(ipKey, 15 * 60),
      emailKey ? redisClient.expire(emailKey, 15 * 60) : Promise.resolve(null)
    ]);
    
    // Store IP info for logging
    req.ipInfo = ipInfo;
    next();
  } catch (error) {
    console.error('Rate limit error:', error);
    next();
  }
};

// Animal years mapping (Chinese zodiac)
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

// Registration endpoint with VPN support
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, birthYear, animalAnswer, mathAnswer } = req.body;
    const ipInfo = getIPInfo(req);
    const clientIP = ipInfo.realIP;

    // Log registration attempt with IP info
    console.log('Registration attempt:', {
      email,
      ipInfo,
      timestamp: new Date().toISOString()
    });

    // Check blocks before registration (email + IP combination)
    const [emailBlock, ipBlock, emailIPBlock] = await Promise.all([
      redisClient.get(`block:email:${email}`),
      redisClient.get(`block:ip:${clientIP}`),
      redisClient.get(`block:emailip:${email}:${clientIP}`)
    ]);
    
    if (emailBlock || ipBlock || emailIPBlock) {
      return res.status(429).json({ 
        error: 'Registration blocked',
        message: 'Registration is blocked for 24 hours due to incorrect answers',
        blockedBy: emailBlock ? 'email' : ipBlock ? 'ip' : 'emailip'
      });
    }

    // Check math answer (2+2*2 = 6)
    if (mathAnswer !== '6') {
      // Block email + IP combination for 24 hours
      await Promise.all([
        redisClient.setEx(`block:email:${email}`, 24 * 60 * 60, '1'),
        redisClient.setEx(`block:ip:${clientIP}`, 24 * 60 * 60, '1'),
        redisClient.setEx(`block:emailip:${email}:${clientIP}`, 24 * 60 * 60, '1')
      ]);
      
      return res.status(400).json({ 
        error: 'Incorrect math answer',
        blocked: true,
        message: 'Email and IP blocked for 24 hours'
      });
    }

    // Check animal answer
    const correctAnimal = animalYears[birthYear];
    if (animalAnswer !== correctAnimal) {
      // Block email + IP combination for 24 hours
      await Promise.all([
        redisClient.setEx(`block:email:${email}`, 24 * 60 * 60, '1'),
        redisClient.setEx(`block:ip:${clientIP}`, 24 * 60 * 60, '1'),
        redisClient.setEx(`block:emailip:${email}:${clientIP}`, 24 * 60 * 60, '1')
      ]);
      
      return res.status(400).json({ 
        error: 'Incorrect animal answer',
        blocked: true,
        message: 'Email and IP blocked for 24 hours'
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
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

// Login endpoint with VPN support
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipInfo = req.ipInfo || getIPInfo(req);
    const clientIP = ipInfo.realIP;

    // Log login attempt with IP info
    console.log('Login attempt:', {
      email,
      ipInfo,
      timestamp: new Date().toISOString()
    });

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Clear attempt counters on successful login
    await Promise.all([
      redisClient.del(`login:attempts:ip:${clientIP}`),
      redisClient.del(`login:attempts:email:${email}`)
    ]);

    // Create JWT token
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
