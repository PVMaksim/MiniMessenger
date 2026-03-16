const jwt = require('jsonwebtoken');
const redis = require('../config/redis');
const db = require('../config/db');

module.exports = function initSocket(io) {
  // Аутентификация через токен при подключении
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Не авторизован'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Токен недействителен'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    console.log(`🟢 Подключился: ${socket.user.username}`);

    // Отмечаем онлайн в Redis
    await redis.set(`online:${userId}`, '1', { EX: 300 });
    io.emit('user:online', { userId });

    // Автоматически подключаем ко всем своим чатам
    const chats = await db.query(
      'SELECT chat_id FROM chat_members WHERE user_id = $1',
      [userId]
    );
    chats.rows.forEach(({ chat_id }) => socket.join(chat_id));

    // Явное присоединение к комнате (на случай новых чатов)
    socket.on('chat:join', async (chatId) => {
      const member = await db.query(
        'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
        [chatId, userId]
      );
      if (member.rows.length > 0) socket.join(chatId);
    });

    // Отправка сообщения
    socket.on('message:send', async ({ chatId, content, fileUrl, fileName, fileType }) => {
      if (!chatId || (!content && !fileUrl)) return;

      try {
        // Проверяем что пользователь — участник чата
        const member = await db.query(
          'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
          [chatId, userId]
        );
        if (member.rows.length === 0) return;

        // Сохраняем в БД
        const result = await db.query(
          `INSERT INTO messages (chat_id, sender_id, content, file_url, file_name, file_type)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [chatId, userId, content || null, fileUrl || null, fileName || null, fileType || null]
        );
        const message = result.rows[0];

        // Получаем данные отправителя
        const userResult = await db.query(
          'SELECT id, username, display_name, avatar_url FROM users WHERE id = $1',
          [userId]
        );

        const fullMessage = {
          ...message,
          sender_id:           userResult.rows[0].id,
          sender_username:     userResult.rows[0].username,
          sender_display_name: userResult.rows[0].display_name,
          sender_avatar_url:   userResult.rows[0].avatar_url,
        };

        // Рассылаем всем участникам чата
        io.to(chatId).emit('message:new', fullMessage);

        // Обновляем TTL онлайн-статуса
        await redis.set(`online:${userId}`, '1', { EX: 300 });
      } catch (err) {
        console.error('message:send error:', err);
        socket.emit('error', { message: 'Не удалось отправить сообщение' });
      }
    });

    // Печатает...
    socket.on('typing:start', ({ chatId }) => {
      socket.to(chatId).emit('typing:start', { userId, username: socket.user.username });
    });
    socket.on('typing:stop', ({ chatId }) => {
      socket.to(chatId).emit('typing:stop', { userId });
    });

    socket.on('disconnect', async () => {
      await redis.del(`online:${userId}`);
      io.emit('user:offline', { userId });
      console.log(`🔴 Отключился: ${socket.user.username}`);
    });
  });
};
