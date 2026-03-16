const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../config/db');

// GET /chats — список чатов текущего пользователя
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         c.id,
         c.name,
         c.is_group,
         c.created_at,
         -- Последнее сообщение
         m.content        AS last_message,
         m.created_at     AS last_message_at,
         m.sender_id      AS last_message_sender,
         -- Для личного чата — имя собеседника
         u.username       AS partner_username,
         u.display_name   AS partner_display_name,
         u.avatar_url     AS partner_avatar_url
       FROM chats c
       JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
       -- Собеседник (только для личных чатов)
       LEFT JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id != $1
       LEFT JOIN users u ON u.id = cm2.user_id AND c.is_group = false
       -- Последнее сообщение
       LEFT JOIN LATERAL (
         SELECT content, created_at, sender_id
         FROM messages
         WHERE chat_id = c.id
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON true
       ORDER BY COALESCE(m.created_at, c.created_at) DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /chats error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /chats — создать личный чат с пользователем
router.post('/', auth, async (req, res) => {
  const { partner_username } = req.body;

  if (!partner_username) {
    return res.status(400).json({ error: 'Укажите partner_username' });
  }
  if (partner_username.toLowerCase() === req.user.username) {
    return res.status(400).json({ error: 'Нельзя создать чат с собой' });
  }

  try {
    // Находим собеседника
    const partnerResult = await db.query(
      'SELECT id, username, display_name FROM users WHERE username = $1',
      [partner_username.toLowerCase()]
    );
    if (partnerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const partner = partnerResult.rows[0];

    // Проверяем — нет ли уже личного чата между ними
    const existing = await db.query(
      `SELECT c.id FROM chats c
       JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = $1
       JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = $2
       WHERE c.is_group = false`,
      [req.user.id, partner.id]
    );
    if (existing.rows.length > 0) {
      return res.status(200).json({ id: existing.rows[0].id, already_exists: true });
    }

    // Создаём чат и добавляем обоих участников
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const chatResult = await client.query(
        'INSERT INTO chats (is_group) VALUES (false) RETURNING *'
      );
      const chat = chatResult.rows[0];

      await client.query(
        'INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)',
        [chat.id, req.user.id, partner.id]
      );

      await client.query('COMMIT');

      res.status(201).json({
        ...chat,
        partner_username:     partner.username,
        partner_display_name: partner.display_name,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('POST /chats error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /chats/:id/messages — история сообщений (с пагинацией)
router.get('/:id/messages', auth, async (req, res) => {
  const { id } = req.params;
  const limit  = parseInt(req.query.limit)  || 50;
  const offset = parseInt(req.query.offset) || 0;

  try {
    // Проверяем что пользователь — участник чата
    const member = await db.query(
      'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (member.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к этому чату' });
    }

    const result = await db.query(
      `SELECT
         m.id,
         m.content,
         m.file_url,
         m.file_name,
         m.file_type,
         m.created_at,
         u.id           AS sender_id,
         u.username     AS sender_username,
         u.display_name AS sender_display_name,
         u.avatar_url   AS sender_avatar_url
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    // Возвращаем в хронологическом порядке
    res.json(result.rows.reverse());
  } catch (err) {
    console.error('GET /chats/:id/messages error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /chats/users — список всех пользователей (для поиска собеседника)
router.get('/users/list', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, display_name, avatar_url, last_seen
       FROM users
       WHERE id != $1
       ORDER BY username`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
