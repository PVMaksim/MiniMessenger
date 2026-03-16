// Сначала — переменные окружения
require('dotenv').config();

// Валидация конфигурации ДО любого подключения к БД или Redis.
// Если что-то не задано — сервер упадёт с понятной ошибкой, а не молча.
const validateEnv = require('./config/validateEnv');
validateEnv();

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors   = require('cors');
const path   = require('path');

const { authLimiter, uploadLimiter, apiLimiter } = require('./middleware/rateLimiter');

const app    = express();
const server = http.createServer(app);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// В продакшене CLIENT_URL берётся из .env (например https://mymessenger.com)
// В разработке разрешаем стандартные dev-порты
const devOrigins = [
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:19006',
];

const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? [process.env.CLIENT_URL].filter(Boolean)
  : devOrigins;

// ─── Socket.io ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:  ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Разрешаем запросы без origin (мобильные приложения, Postman)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
}));
app.use(express.json({ limit: '1mb' }));   // ограничиваем JSON-тело
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── Маршруты ─────────────────────────────────────────────────────────────────
// Rate limiting применяется точечно: строже там, где это важнее
app.use('/auth',   authLimiter,   require('./routes/auth'));
app.use('/upload', uploadLimiter, require('./routes/upload'));
app.use('/chats',  apiLimiter,    require('./routes/chats'));

// ─── Health check ─────────────────────────────────────────────────────────────
// Используется Docker и nginx для проверки что сервер живой
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ─── Глобальный обработчик ошибок ────────────────────────────────────────────
// Перехватывает любые необработанные ошибки middleware и роутов
// В production отправляет уведомление разработчику в Telegram
const { errorNotifierMiddleware } = require('./utils/notifyAdmin');
app.use(errorNotifierMiddleware());

// ─── Socket.io ────────────────────────────────────────────────────────────────
require('./socket')(io);

// ─── Запуск ───────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 4000;
server.listen(PORT, () => {
  console.log(`🚀 MiniMessenger backend запущен на http://localhost:${PORT}`);
  console.log(`   Режим: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   CORS:  ${ALLOWED_ORIGINS.join(', ')}`);
});
