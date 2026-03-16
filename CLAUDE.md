# CLAUDE.md — Инструкция для работы с MiniMessenger

> Этот файл читает Claude перед тем как работать с проектом.
> Здесь собрано всё необходимое: архитектура, соглашения, паттерны, API.

---

## Стек и структура

```
minimessenger/
├── backend/                        # Node.js + Express + Socket.io
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js               # Pool-соединение с PostgreSQL (pg)
│   │   │   ├── redis.js            # Redis-клиент (redis v4)
│   │   │   ├── init.sql            # Схема БД (выполняется при первом Docker-запуске)
│   │   │   └── validateEnv.js      # Валидация .env при старте — ВЫЗЫВАЕТСЯ ПЕРВЫМ
│   │   ├── middleware/
│   │   │   ├── auth.js             # JWT middleware → req.user = { id, username }
│   │   │   └── rateLimiter.js      # In-memory rate limiter, три пресета
│   │   ├── routes/
│   │   │   ├── auth.js             # POST /auth/register, /login; GET /auth/me
│   │   │   ├── chats.js            # GET/POST /chats; GET /chats/:id/messages; GET /chats/users/list
│   │   │   └── upload.js           # POST /upload (multer, до 20 МБ)
│   │   ├── socket/
│   │   │   └── index.js            # Socket.io: аутентификация, message:send, typing, online
│   │   ├── utils/
│   │   │   └── notifyAdmin.js      # Уведомления об ошибках в Telegram + Express middleware
│   │   └── server.js               # Точка входа
│   ├── __tests__/                  # Jest + Supertest тесты
│   ├── __mocks__/                  # Моки db.js и redis.js для тестов
│   ├── uploads/                    # Загруженные файлы пользователей
│   ├── Dockerfile
│   ├── .env.example
│   └── jest.config.js
│
├── frontend/                       # React + Vite
│   └── src/
│       ├── pages/
│       │   ├── LoginPage.jsx       # Вход и регистрация
│       │   └── ChatPage.jsx        # Главная страница: список чатов + переписка
│       ├── api/
│       │   └── client.js           # axios, baseURL='/', автоматический Bearer-токен
│       ├── socket/
│       │   └── index.js            # Синглтон socket.io-client
│       └── main.jsx                # Router: /login → LoginPage, / → ChatPage (PrivateRoute)
│
├── mobile/                         # React Native + Expo
│   └── src/
│       ├── screens/
│       │   ├── LoginScreen.js      # Вход и регистрация
│       │   ├── ChatsScreen.js      # Список чатов
│       │   └── ChatScreen.js       # Переписка + отправка файлов (ImagePicker)
│       ├── api/
│       │   └── client.js           # axios, BASE_URL = IP локальной машины
│       └── socket/
│           └── index.js            # Синглтон socket.io-client для RN
│
├── nginx/
│   └── nginx.conf                  # Обратный прокси, HTTPS, WebSocket, SPA
├── scripts/
│   ├── backup.sh                   # Резервное копирование БД (ежедневно по cron)
│   └── health_check.sh             # Проверка статуса всех сервисов
├── docker-compose.yml              # Все сервисы: postgres, redis, backend, frontend, nginx
├── DEPLOY.md                       # Инструкция деплоя на VPS
└── .github/
    └── workflows/
        └── deploy.yml              # CI/CD: автодеплой при пуше в main (опционально)
```

---

## Схема базы данных

```sql
users         — id (UUID), username, password (bcrypt), display_name, avatar_url, created_at, last_seen
chats         — id (UUID), name (NULL для личных), is_group (bool), created_at
chat_members  — chat_id, user_id  (составной PK)
messages      — id, chat_id, sender_id, content, file_url, file_name, file_type, created_at
```

**Ключевые индексы:** `idx_messages_chat_id`, `idx_messages_created_at DESC`, `idx_chat_members_user_id`

---

## REST API

Все защищённые маршруты требуют `Authorization: Bearer <token>`.

### Auth
| Метод | URL | Body | Ответ |
|-------|-----|------|-------|
| POST | `/auth/register` | `{ username, password, display_name? }` | `{ token, user }` |
| POST | `/auth/login` | `{ username, password }` | `{ token, user }` |
| GET | `/auth/me` | — | `{ id, username, display_name, avatar_url }` |

### Chats
| Метод | URL | Ответ |
|-------|-----|-------|
| GET | `/chats` | Список чатов с последним сообщением и данными собеседника |
| POST | `/chats` | `{ partner_username }` → создаёт личный чат (или возвращает существующий) |
| GET | `/chats/:id/messages?limit=50&offset=0` | История в хронологическом порядке |
| GET | `/chats/users/list` | Все пользователи кроме себя |

### Upload
| Метод | URL | Body | Ответ |
|-------|-----|------|-------|
| POST | `/upload` | `multipart/form-data`, поле `file` | `{ url, name, type, size }` |

Файлы отдаются статически: `GET /uploads/<filename>`

---

## Socket.io события

### Клиент → Сервер
| Событие | Данные | Описание |
|---------|--------|----------|
| `chat:join` | `chatId` | Войти в комнату (после создания нового чата) |
| `message:send` | `{ chatId, content?, fileUrl?, fileName?, fileType? }` | Отправить сообщение |
| `typing:start` | `{ chatId }` | Начал печатать |
| `typing:stop` | `{ chatId }` | Перестал печатать |

### Сервер → Клиент
| Событие | Данные | Описание |
|---------|--------|----------|
| `message:new` | Полный объект сообщения с данными отправителя | Новое сообщение в чате |
| `user:online` | `{ userId }` | Пользователь подключился |
| `user:offline` | `{ userId }` | Пользователь отключился |
| `typing:start` | `{ userId, username }` | Кто-то печатает |
| `typing:stop` | `{ userId }` | Перестал печатать |

**Аутентификация сокета:** токен передаётся в `socket.handshake.auth.token` при подключении.

**Онлайн-статус:** хранится в Redis с TTL 300 сек (`online:{userId} = '1'`). Обновляется при каждом `message:send`.

---

## Паттерны кода

### Бэкенд — защищённый роут
```js
const auth = require('../middleware/auth');
router.get('/something', auth, async (req, res) => {
  const userId = req.user.id; // гарантированно есть
  const result = await db.query('SELECT ...', [userId]);
  res.json(result.rows);
});
```

### Бэкенд — транзакция
```js
const client = await db.connect();
try {
  await client.query('BEGIN');
  // ... несколько запросов ...
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release(); // ОБЯЗАТЕЛЬНО
}
```

### Frontend — отправка сообщения через сокет
```js
const socket = getSocket();
socket.emit('message:send', { chatId, content: text.trim() });
```

### Frontend — загрузка файла
```js
const formData = new FormData();
formData.append('file', file);
const { data } = await api.post('/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
// data = { url, name, type, size }
socket.emit('message:send', { chatId, fileUrl: data.url, fileName: data.name, fileType: data.type });
```

### Mobile — отправка фото
```js
const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });
if (!result.canceled) {
  const { uri, fileName, mimeType } = result.assets[0];
  // Затем uploadAndSend(uri, fileName, mimeType)
}
```

### Тесты — мок db.query
```js
jest.mock('../../src/config/db');
const db = require('../../src/config/db');

db.query.mockResolvedValueOnce({ rows: [{ id: 'uid' }] }); // первый вызов
db.query.mockResolvedValueOnce({ rows: [] });               // второй вызов
```

---

## Rate limiting

Три пресета из `src/middleware/rateLimiter.js`:

| Лимитер | Маршрут | Лимит | Окно |
|---------|---------|-------|------|
| `authLimiter` | `/auth` | 10 запросов | 15 минут |
| `uploadLimiter` | `/upload` | 30 файлов | 1 час |
| `apiLimiter` | `/chats` | 300 запросов | 1 минута |

При превышении → `429 Too Many Requests` + заголовки `Retry-After`, `X-RateLimit-*`.

---

## Переменные окружения

Файл: `backend/.env` (создаётся из `.env.example`)

Критичные:
- `JWT_SECRET` — минимум 32 символа, не дефолтный
- `DB_PASSWORD` — для PostgreSQL
- `CLIENT_URL` — URL фронтенда (для CORS в продакшене)
- В Docker: `DB_HOST=postgres`, `REDIS_HOST=redis`

Опционально (для production):
- `TELEGRAM_BOT_TOKEN` — токен бота для уведомлений об ошибках
- `ADMIN_TELEGRAM_ID` — Telegram ID разработчика для получения уведомлений

`validateEnv.js` вызывается первой строкой в `server.js`. При неверной конфигурации — процесс завершается с понятным сообщением.

---

## Запуск локально

```bash
# Базы данных
docker compose up -d postgres redis

# Бэкенд
cd backend && npm install && npm run dev   # порт 4000

# Фронтенд
cd frontend && npm install && npm run dev  # порт 5173

# Мобайл
cd mobile && npm install && npx expo start
```

## Запуск тестов

```bash
cd backend
npm test               # один прогон
npm run test:watch     # с перезапуском при изменениях
npm run test:coverage  # с отчётом покрытия
```

## Запуск в продакшене

```bash
docker compose up -d --build
docker compose ps      # проверить статус
docker compose logs -f backend  # логи
```

## Скрипты обслуживания

```bash
# Проверка состояния сервисов
./scripts/health_check.sh

# Резервное копирование БД (можно запускать вручную)
./scripts/backup.sh

# Настройка cron для ежедневного бэкапа в 3:00
crontab -e
# Добавить: 0 3 * * * /opt/minimessenger/scripts/backup.sh >> /var/log/minimessenger_backup.log 2>&1
```

---

## Что важно знать при изменениях

**Добавляешь новый роут в бэкенд:**
1. Создай файл в `backend/src/routes/`
2. Подключи в `server.js`: `app.use('/newroute', limiter, require('./routes/newroute'))`
3. Напиши тесты в `backend/__tests__/newroute.test.js`

**Добавляешь новую Socket.io-колонку:**
1. Добавь обработчик в `backend/src/socket/index.js`
2. Добавь `socket.on(...)` в `frontend/src/pages/ChatPage.jsx`
3. Добавь `socket.on(...)` в `mobile/src/screens/ChatScreen.js` или `ChatsScreen.js`
4. Не забудь `socket.off(...)` в cleanup useEffect

**Меняешь схему БД:**
1. Обнови `backend/src/config/init.sql`
2. При деплое: либо пересоздать контейнер postgres (потеря данных!), либо написать ALTER TABLE вручную через `docker exec`

**Добавляешь поле в `.env`:**
1. Добавь переменную в `backend/.env.example` с комментарием
2. Добавь проверку в `backend/src/config/validateEnv.js` если поле обязательное

---

## Соглашения

- Все имена пользователей хранятся и сравниваются в **lowercase** (`username.toLowerCase()`)
- UUID генерируются на стороне PostgreSQL (`gen_random_uuid()`)
- Файлы называются `<uuid><ext>` — оригинальное имя хранится в `file_name`
- История сообщений: БД возвращает DESC, роутер делает `.reverse()` → хронологический порядок
- Токен в браузере: `localStorage.mm_token` и `localStorage.mm_user`
- Токен в мобайле: `AsyncStorage mm_token` и `AsyncStorage mm_user`
