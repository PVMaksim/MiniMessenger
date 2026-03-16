const https = require('https');

/**
 * Отправляет уведомление об ошибке разработчику в Telegram.
 * Используется для оповещения о критических ошибках в production.
 *
 * @param {string} message - Текст сообщения об ошибке
 * @param {string} [context] - Дополнительный контекст (имя модуля, запрос и т.д.)
 * @param {Error} [error] - Объект ошибки для детализации
 * @returns {Promise<void>}
 */
async function notifyAdmin(message, context = '', error = null) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = process.env.ADMIN_TELEGRAM_ID;

  // Если переменные не заданы — silently ignore (для разработки)
  if (!botToken || !adminId) {
    console.warn('[NotifyAdmin] TELEGRAM_BOT_TOKEN или ADMIN_TELEGRAM_ID не заданы. Уведомление пропущено.');
    return;
  }

  let fullMessage = `🔴 <b>Ошибка MiniMessenger</b>\n`;

  if (context) {
    fullMessage += `📍 <b>Контекст:</b> <code>${escapeHtml(context)}</code>\n\n`;
  }

  fullMessage += `<pre>${escapeHtml(message)}</pre>`;

  if (error) {
    const stack = error.stack || String(error);
    // Обрезаем стек до 3000 символов (лимит Telegram)
    const truncatedStack = stack.length > 3000 ? stack.slice(0, 3000) + '...' : stack;
    fullMessage += `\n\n<pre>${escapeHtml(truncatedStack)}</pre>`;
  }

  // Добавляем метаданные
  const timestamp = new Date().toISOString();
  const nodeEnv = process.env.NODE_ENV || 'development';
  fullMessage += `\n\n─────────────\n`;
  fullMessage += `<i>⏰ ${timestamp} | ENV: ${nodeEnv}</i>`;

  const data = JSON.stringify({
    chat_id: adminId,
    text: fullMessage,
    parse_mode: 'HTML',
  });

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${botToken}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
    timeout: 5000,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        const result = JSON.parse(responseData);
        if (result.ok) {
          console.log('[NotifyAdmin] Уведомление отправлено успешно');
          resolve();
        } else {
          console.error('[NotifyAdmin] Ошибка Telegram API:', result.description);
          reject(new Error(`Telegram API error: ${result.description}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('[NotifyAdmin] Ошибка отправки уведомления:', err.message);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Telegram request timeout'));
    });

    req.write(data);
    req.end();
  });
}

/**
 * Экранирует HTML-специальные символы для безопасного вывода в Telegram.
 * @param {string} text - Исходный текст
 * @returns {string} - Экранированный текст
 */
function escapeHtml(text) {
  const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(text).replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

/**
 * Middleware для Express — перехватывает все необработанные ошибки
 * и отправляет уведомление разработчику.
 */
function errorNotifierMiddleware() {
  // eslint-disable-next-line no-unused-vars
  return async (err, req, res, next) => {
    const context = `${req.method} ${req.originalUrl}`;
    const message = `${err.name}: ${err.message}`;

    // Отправляем уведомление (не блокируя ответ)
    notifyAdmin(message, context, err).catch((notifyErr) => {
      console.error('[NotifyAdmin] Не удалось отправить уведомление:', notifyErr.message);
    });

    // Стандартная обработка ошибки
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      error: process.env.NODE_ENV === 'production'
        ? 'Внутренняя ошибка сервера'
        : err.message,
    });
  };
}

module.exports = {
  notifyAdmin,
  errorNotifierMiddleware,
};
