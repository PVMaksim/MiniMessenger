/**
 * Тесты: src/middleware/auth.js
 *
 * Проверяем три сценария:
 *  1. Нет токена → 401
 *  2. Невалидный / просроченный токен → 403
 *  3. Валидный токен → req.user заполнен, next() вызван
 */

const jwt = require('jsonwebtoken');

// Устанавливаем секрет ДО подключения модуля
process.env.JWT_SECRET = 'test_secret';

const authMiddleware = require('../../src/middleware/auth');

describe('middleware/auth', () => {
  let req, res, next;

  beforeEach(() => {
    req  = { headers: {} };
    res  = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  test('401 — заголовок Authorization отсутствует', () => {
    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Токен не передан' });
    expect(next).not.toHaveBeenCalled();
  });

  test('401 — заголовок есть, но токен пустой ("Bearer ")', () => {
    req.headers['authorization'] = 'Bearer ';
    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 — токен подписан другим секретом', () => {
    const badToken = jwt.sign({ id: '1', username: 'alice' }, 'wrong_secret');
    req.headers['authorization'] = `Bearer ${badToken}`;

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Токен недействителен' });
    expect(next).not.toHaveBeenCalled();
  });

  test('403 — токен просрочен', () => {
    const expiredToken = jwt.sign(
      { id: '1', username: 'alice' },
      'test_secret',
      { expiresIn: -1 }   // уже истёк
    );
    req.headers['authorization'] = `Bearer ${expiredToken}`;

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('✅ валидный токен — next() вызван, req.user заполнен', () => {
    const payload = { id: 'abc-123', username: 'alice' };
    const token   = jwt.sign(payload, 'test_secret', { expiresIn: '1h' });
    req.headers['authorization'] = `Bearer ${token}`;

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ id: 'abc-123', username: 'alice' });
    expect(res.status).not.toHaveBeenCalled();
  });
});
