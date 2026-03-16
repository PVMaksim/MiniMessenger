const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// POST /auth/register
router.post('/register', async (req, res) => {
  const { username, password, display_name } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Укажите username и password' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  }

  try {
    // Проверяем что username свободен
    const exists = await db.query(
      'SELECT id FROM users WHERE username = $1',
      [username.toLowerCase()]
    );
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь уже существует' });
    }

    // Хешируем пароль
    const hash = await bcrypt.hash(password, 12);

    // Создаём пользователя
    const result = await db.query(
      `INSERT INTO users (username, password, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, username, display_name, created_at`,
      [username.toLowerCase(), hash, display_name || username]
    );

    const user = result.rows[0];

    // Выдаём токен
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Укажите username и password' });
  }

  try {
    // Ищем пользователя
    const result = await db.query(
      'SELECT * FROM users WHERE username = $1',
      [username.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const user = result.rows[0];

    // Проверяем пароль
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Обновляем last_seen
    await db.query(
      'UPDATE users SET last_seen = NOW() WHERE id = $1',
      [user.id]
    );

    // Выдаём токен
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id:           user.id,
        username:     user.username,
        display_name: user.display_name,
        avatar_url:   user.avatar_url,
      },
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /auth/me — получить текущего пользователя по токену
const auth = require('../middleware/auth');
router.get('/me', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, display_name, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
