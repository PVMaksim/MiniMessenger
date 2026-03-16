/**
 * Тесты: src/routes/auth.js
 *
 * POST /auth/register — регистрация
 * POST /auth/login    — вход
 * GET  /auth/me       — получить текущего пользователя
 */

process.env.JWT_SECRET     = 'test_secret';
process.env.JWT_EXPIRES_IN = '7d';

const request = require('supertest');
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

// Мокаем БД до импорта роутера
jest.mock('../../src/config/db');
jest.mock('../../src/config/redis');

const db         = require('../../src/config/db');
const authRouter = require('../../src/routes/auth');

// Минимальное Express-приложение для тестов
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

// ─────────────────────────────────────────────
// POST /auth/register
// ─────────────────────────────────────────────
describe('POST /auth/register', () => {
  test('400 — нет username', async () => {
    const res = await request(makeApp())
      .post('/auth/register')
      .send({ password: 'secret123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/username/i);
  });

  test('400 — пароль короче 6 символов', async () => {
    const res = await request(makeApp())
      .post('/auth/register')
      .send({ username: 'alice', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 символ/);
  });

  test('409 — пользователь уже существует', async () => {
    // Первый запрос — проверка существования — возвращает совпадение
    db.query.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

    const res = await request(makeApp())
      .post('/auth/register')
      .send({ username: 'alice', password: 'secret123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/уже существует/);
  });

  test('201 — успешная регистрация, возвращает token и user', async () => {
    const fakeUser = {
      id:           'new-uuid',
      username:     'alice',
      display_name: 'Alice',
      created_at:   new Date().toISOString(),
    };

    // 1-й query — проверка дубликата (пусто)
    db.query.mockResolvedValueOnce({ rows: [] });
    // 2-й query — INSERT нового пользователя
    db.query.mockResolvedValueOnce({ rows: [fakeUser] });

    const res = await request(makeApp())
      .post('/auth/register')
      .send({ username: 'Alice', password: 'secret123', display_name: 'Alice' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ username: 'alice', display_name: 'Alice' });

    // Токен должен содержать id пользователя
    const decoded = jwt.verify(res.body.token, 'test_secret');
    expect(decoded.id).toBe('new-uuid');
  });

  test('500 — ошибка БД пробрасывается как 500', async () => {
    db.query.mockRejectedValueOnce(new Error('DB connection failed'));

    const res = await request(makeApp())
      .post('/auth/register')
      .send({ username: 'alice', password: 'secret123' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Ошибка сервера/);
  });
});

// ─────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────
describe('POST /auth/login', () => {
  test('400 — нет username или password', async () => {
    const res = await request(makeApp())
      .post('/auth/login')
      .send({ username: 'alice' });

    expect(res.status).toBe(400);
  });

  test('401 — пользователь не найден', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp())
      .post('/auth/login')
      .send({ username: 'ghost', password: 'secret123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/логин или пароль/i);
  });

  test('401 — неверный пароль', async () => {
    const hash = await bcrypt.hash('correct_password', 10);
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'uid', username: 'alice', password: hash, display_name: 'Alice', avatar_url: null }],
    });

    const res = await request(makeApp())
      .post('/auth/login')
      .send({ username: 'alice', password: 'wrong_password' });

    expect(res.status).toBe(401);
  });

  test('✅ 200 — успешный вход, возвращает token и user', async () => {
    const hash = await bcrypt.hash('secret123', 10);
    const fakeUser = { id: 'uid-1', username: 'alice', password: hash, display_name: 'Alice', avatar_url: null };

    // SELECT пользователя
    db.query.mockResolvedValueOnce({ rows: [fakeUser] });
    // UPDATE last_seen
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp())
      .post('/auth/login')
      .send({ username: 'alice', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ id: 'uid-1', username: 'alice' });
    expect(res.body.user).not.toHaveProperty('password'); // пароль не утекает!
  });
});

// ─────────────────────────────────────────────
// GET /auth/me
// ─────────────────────────────────────────────
describe('GET /auth/me', () => {
  function makeToken(payload = { id: 'uid-1', username: 'alice' }) {
    return jwt.sign(payload, 'test_secret', { expiresIn: '1h' });
  }

  test('401 — без токена', async () => {
    const res = await request(makeApp()).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('404 — пользователь удалён из БД', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp())
      .get('/auth/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  test('✅ 200 — возвращает данные текущего пользователя', async () => {
    const fakeUser = { id: 'uid-1', username: 'alice', display_name: 'Alice', avatar_url: null, created_at: new Date() };
    db.query.mockResolvedValueOnce({ rows: [fakeUser] });

    const res = await request(makeApp())
      .get('/auth/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'uid-1', username: 'alice' });
  });
});
