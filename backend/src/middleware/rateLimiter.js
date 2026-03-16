/**
 * src/middleware/rateLimiter.js
 *
 * Простой in-memory rate limiter без внешних зависимостей.
 * Для продакшена с несколькими инстансами можно заменить на express-rate-limit + Redis store,
 * но для проекта до 50 пользователей этого более чем достаточно.
 *
 * Использование:
 *   const { authLimiter, uploadLimiter, apiLimiter } = require('./middleware/rateLimiter');
 *   app.use('/auth',   authLimiter);
 *   app.use('/upload', uploadLimiter);
 *   app.use('/chats',  apiLimiter);
 */

/**
 * Создаёт middleware-функцию rate limiter.
 *
 * @param {object} options
 * @param {number} options.windowMs   — окно в миллисекундах
 * @param {number} options.max        — максимум запросов за окно
 * @param {string} options.message    — текст ошибки при превышении
 * @param {string} [options.keyBy]    — 'ip' (по умолчанию) или 'user' (по userId из токена)
 */
function createLimiter({ windowMs, max, message, keyBy = 'ip' }) {
  // Map: ключ → { count, resetAt }
  const store = new Map();

  // Чистим устаревшие записи каждые 5 минут чтобы не копить память
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 5 * 60 * 1000);

  return function rateLimiterMiddleware(req, res, next) {
    // Определяем ключ
    let key;
    if (keyBy === 'user' && req.user?.id) {
      key = `user:${req.user.id}`;
    } else {
      // Учитываем X-Forwarded-For если сервер за nginx
      key = `ip:${req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip}`;
    }

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      // Первый запрос в новом окне
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));
      return res.status(429).json({
        error:       message,
        retryAfter,
      });
    }

    entry.count += 1;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', max - entry.count);
    next();
  };
}

// ─── Готовые лимитеры ────────────────────────────────────────────────────────

/**
 * Авторизация: 10 попыток за 15 минут с одного IP.
 * Защищает от брутфорса паролей.
 */
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  'Слишком много попыток входа. Подожди 15 минут.',
});

/**
 * Загрузка файлов: 30 файлов в час с одного IP.
 * Защищает от флуда загрузками.
 */
const uploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max:      30,
  message:  'Слишком много загрузок. Подожди немного.',
});

/**
 * Общий API: 300 запросов в минуту с одного IP.
 * Мягкий лимит — просто против случайных скриптов.
 */
const apiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max:      300,
  message:  'Слишком много запросов. Замедлись немного.',
});

module.exports = { authLimiter, uploadLimiter, apiLimiter };
