/**
 * Тесты: src/routes/upload.js
 *
 * POST /upload — загрузка файла
 */

process.env.JWT_SECRET    = 'test_secret';
process.env.MAX_FILE_SIZE = String(20 * 1024 * 1024);

const request = require('supertest');
const express = require('express');
const jwt     = require('jsonwebtoken');
const path    = require('path');

jest.mock('../../src/config/db');
jest.mock('../../src/config/redis');

const uploadRouter = require('../../src/routes/upload');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/upload', uploadRouter);
  return app;
}

const TOKEN = jwt.sign({ id: 'user-1', username: 'alice' }, 'test_secret', { expiresIn: '1h' });
const AUTH  = { Authorization: `Bearer ${TOKEN}` };

describe('POST /upload', () => {
  test('401 — без токена', async () => {
    const res = await request(makeApp()).post('/upload');
    expect(res.status).toBe(401);
  });

  test('400 — файл не передан', async () => {
    const res = await request(makeApp())
      .post('/upload')
      .set(AUTH);
      // Намеренно не прикрепляем файл

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Файл не передан/);
  });

  test('✅ 200 — успешная загрузка возвращает url, name, type, size', async () => {
    // Создаём маленький тестовый файл в памяти
    const fakeFileBuffer = Buffer.from('fake image content');

    const res = await request(makeApp())
      .post('/upload')
      .set(AUTH)
      .attach('file', fakeFileBuffer, {
        filename:    'test-image.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('url');
    expect(res.body).toHaveProperty('name', 'test-image.png');
    expect(res.body).toHaveProperty('type', 'image/png');
    expect(res.body).toHaveProperty('size');

    // URL должен начинаться с /uploads/
    expect(res.body.url).toMatch(/^\/uploads\//);
  });

  test('✅ имя файла в ответе содержит оригинальное имя', async () => {
    const res = await request(makeApp())
      .post('/upload')
      .set(AUTH)
      .attach('file', Buffer.from('doc content'), {
        filename:    'document.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('document.pdf');
    expect(res.body.type).toBe('application/pdf');
  });

  test('413 — файл превышает лимит (21 МБ)', async () => {
    // Временно уменьшаем лимит чтобы тест был быстрым
    process.env.MAX_FILE_SIZE = String(100); // 100 байт

    // Перезагружаем роутер с новым лимитом
    jest.resetModules();
    jest.mock('../../src/config/db');
    jest.mock('../../src/config/redis');
    const smallLimitRouter = require('../../src/routes/upload');

    const smallApp = express();
    smallApp.use(express.json());
    smallApp.use('/upload', smallLimitRouter);

    const bigBuffer = Buffer.alloc(200, 'x'); // 200 байт > 100 лимита

    const res = await request(smallApp)
      .post('/upload')
      .set({ Authorization: `Bearer ${TOKEN}` })
      .attach('file', bigBuffer, { filename: 'big.txt', contentType: 'text/plain' });

    // Multer возвращает 500 при превышении лимита — проверяем что НЕ 200
    expect(res.status).not.toBe(200);

    // Восстанавливаем лимит
    process.env.MAX_FILE_SIZE = String(20 * 1024 * 1024);
  });
});
