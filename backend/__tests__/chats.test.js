/**
 * Тесты: src/routes/chats.js
 *
 * GET  /chats               — список чатов
 * POST /chats               — создать личный чат
 * GET  /chats/:id/messages  — история сообщений
 * GET  /chats/users/list    — список пользователей
 */

process.env.JWT_SECRET = 'test_secret';

const request = require('supertest');
const express = require('express');
const jwt     = require('jsonwebtoken');

jest.mock('../../src/config/db');
jest.mock('../../src/config/redis');

const db          = require('../../src/config/db');
const chatsRouter = require('../../src/routes/chats');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/chats', chatsRouter);
  return app;
}

// Токен для авторизованного пользователя
function makeToken(payload = { id: 'user-1', username: 'alice' }) {
  return jwt.sign(payload, 'test_secret', { expiresIn: '1h' });
}

const AUTH = { Authorization: `Bearer ${makeToken()}` };

// ─────────────────────────────────────────────
// GET /chats
// ─────────────────────────────────────────────
describe('GET /chats', () => {
  test('401 — без токена', async () => {
    const res = await request(makeApp()).get('/chats');
    expect(res.status).toBe(401);
  });

  test('✅ 200 — возвращает массив чатов', async () => {
    const fakeChats = [
      { id: 'chat-1', is_group: false, partner_username: 'bob', last_message: 'Привет' },
      { id: 'chat-2', is_group: false, partner_username: 'carol', last_message: null },
    ];
    db.query.mockResolvedValueOnce({ rows: fakeChats });

    const res = await request(makeApp()).get('/chats').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 'chat-1', partner_username: 'bob' });
  });

  test('✅ 200 — пустой список если чатов нет', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp()).get('/chats').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('500 — ошибка БД', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(makeApp()).get('/chats').set(AUTH);

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────
// POST /chats
// ─────────────────────────────────────────────
describe('POST /chats', () => {
  test('400 — не передан partner_username', async () => {
    const res = await request(makeApp())
      .post('/chats')
      .set(AUTH)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/partner_username/);
  });

  test('400 — нельзя создать чат с собой', async () => {
    const res = await request(makeApp())
      .post('/chats')
      .set(AUTH)
      .send({ partner_username: 'alice' }); // alice — это сам пользователь

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/с собой/);
  });

  test('404 — собеседник не найден в БД', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // партнёр не найден

    const res = await request(makeApp())
      .post('/chats')
      .set(AUTH)
      .send({ partner_username: 'ghost' });

    expect(res.status).toBe(404);
  });

  test('200 — чат уже существует, возвращает его id', async () => {
    // Поиск партнёра
    db.query.mockResolvedValueOnce({ rows: [{ id: 'user-2', username: 'bob', display_name: 'Bob' }] });
    // Проверка существующего чата — найден
    db.query.mockResolvedValueOnce({ rows: [{ id: 'existing-chat' }] });

    const res = await request(makeApp())
      .post('/chats')
      .set(AUTH)
      .send({ partner_username: 'bob' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'existing-chat', already_exists: true });
  });

  test('✅ 201 — новый чат создан, возвращает его данные', async () => {
    const mockClient = {
      query:   jest.fn(),
      release: jest.fn(),
    };

    // Поиск партнёра
    db.query.mockResolvedValueOnce({ rows: [{ id: 'user-2', username: 'bob', display_name: 'Bob' }] });
    // Существующий чат — не найден
    db.query.mockResolvedValueOnce({ rows: [] });
    // Транзакция через client
    db.connect.mockResolvedValueOnce(mockClient);

    const newChat = { id: 'new-chat', is_group: false, created_at: new Date() };
    mockClient.query
      .mockResolvedValueOnce({})                    // BEGIN
      .mockResolvedValueOnce({ rows: [newChat] })   // INSERT INTO chats
      .mockResolvedValueOnce({})                    // INSERT INTO chat_members
      .mockResolvedValueOnce({});                   // COMMIT

    const res = await request(makeApp())
      .post('/chats')
      .set(AUTH)
      .send({ partner_username: 'bob' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'new-chat', partner_username: 'bob' });
    expect(mockClient.release).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// GET /chats/:id/messages
// ─────────────────────────────────────────────
describe('GET /chats/:id/messages', () => {
  test('401 — без токена', async () => {
    const res = await request(makeApp()).get('/chats/chat-1/messages');
    expect(res.status).toBe(401);
  });

  test('403 — пользователь не участник чата', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // проверка членства — пусто

    const res = await request(makeApp())
      .get('/chats/chat-1/messages')
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Нет доступа/);
  });

  test('✅ 200 — возвращает историю в хронологическом порядке', async () => {
    const now = new Date();
    const fakeMessages = [
      { id: 'msg-2', content: 'Как дела?', created_at: new Date(now - 1000), sender_id: 'user-2' },
      { id: 'msg-1', content: 'Привет!',   created_at: new Date(now - 2000), sender_id: 'user-1' },
    ]; // БД вернула DESC (новые сначала), роутер должен сделать reverse()

    // Проверка членства
    db.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    // История сообщений
    db.query.mockResolvedValueOnce({ rows: fakeMessages });

    const res = await request(makeApp())
      .get('/chats/chat-1/messages')
      .set(AUTH);

    expect(res.status).toBe(200);
    // После reverse() — старое сообщение должно быть первым
    expect(res.body[0].id).toBe('msg-1');
    expect(res.body[1].id).toBe('msg-2');
  });

  test('✅ пагинация — передаёт limit и offset в запрос', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    db.query.mockResolvedValueOnce({ rows: [] });

    await request(makeApp())
      .get('/chats/chat-1/messages?limit=10&offset=20')
      .set(AUTH);

    // Второй вызов db.query — это запрос сообщений
    const [sql, params] = db.query.mock.calls[1];
    expect(params).toContain(10);  // limit
    expect(params).toContain(20);  // offset
  });
});

// ─────────────────────────────────────────────
// GET /chats/users/list
// ─────────────────────────────────────────────
describe('GET /chats/users/list', () => {
  test('401 — без токена', async () => {
    const res = await request(makeApp()).get('/chats/users/list');
    expect(res.status).toBe(401);
  });

  test('✅ 200 — возвращает список пользователей без себя', async () => {
    const fakeUsers = [
      { id: 'user-2', username: 'bob',   display_name: 'Bob',   avatar_url: null, last_seen: null },
      { id: 'user-3', username: 'carol', display_name: 'Carol', avatar_url: null, last_seen: null },
    ];
    db.query.mockResolvedValueOnce({ rows: fakeUsers });

    const res = await request(makeApp())
      .get('/chats/users/list')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // Текущий пользователь (user-1 / alice) не должен быть в списке
    expect(res.body.find(u => u.username === 'alice')).toBeUndefined();
  });
});
