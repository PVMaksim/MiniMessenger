-- MiniMessenger — схема базы данных
-- Автоматически выполняется при первом запуске Docker

-- Пользователи
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    VARCHAR(50) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  avatar_url  VARCHAR(255),
  created_at  TIMESTAMP DEFAULT NOW(),
  last_seen   TIMESTAMP DEFAULT NOW()
);

-- Чаты (личные и групповые)
CREATE TABLE IF NOT EXISTS chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100),           -- NULL для личных чатов
  is_group    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Участники чатов
CREATE TABLE IF NOT EXISTS chat_members (
  chat_id     UUID REFERENCES chats(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at   TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);

-- Сообщения
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     UUID REFERENCES chats(id) ON DELETE CASCADE,
  sender_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  content     TEXT,
  file_url    VARCHAR(255),
  file_name   VARCHAR(255),
  file_type   VARCHAR(100),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Индексы для быстрых запросов
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members(user_id);
