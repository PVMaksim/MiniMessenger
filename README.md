# 💬 MiniMessenger

Простой мессенджер для закрытой группы до 50 пользователей.

## Стек
- **Backend:** Node.js + Express + Socket.io
- **DB:** PostgreSQL + Redis
- **Web:** React (Vite)
- **Mobile:** React Native (Expo)
- **Deploy:** Docker + Nginx

## Быстрый старт (локально)

```bash
# 1. Запустить базы данных
docker-compose up -d postgres redis

# 2. Бэкенд
cd backend && npm install && npm run dev

# 3. Фронтенд
cd frontend && npm install && npm run dev

# 4. Мобильное
cd mobile && npm install && npx expo start
```

## Структура
```
minimessenger/
├── backend/        # Node.js сервер
├── frontend/       # React веб-приложение
├── mobile/         # React Native (Expo)
├── scripts/        # Скрипты обслуживания (бэкапы, health check)
├── nginx/          # Конфигурация nginx
├── docker-compose.yml
├── DEPLOY.md       # Инструкция деплоя на VPS
├── CLAUDE.md       # Архитектура и правила для ИИ
├── MEMORY.md       # Состояние проекта и история изменений
└── README.md
```

## Статус разработки

| Фаза | Описание | Статус |
|------|----------|--------|
| 1 | Подготовка окружения | ✅ Завершена |
| 2 | Бэкенд (API + Socket.io) | ✅ Завершена |
| 3 | Веб-клиент (React) | ✅ Завершена |
| 4 | Мобильное приложение (Expo) | ✅ Завершена |
| 5 | Деплой (Docker + nginx + VPS) | ✅ Завершена |

**Проект готов к продакшену.** MVP реализовано полностью.

## Функциональность MVP

- ✅ Регистрация и вход по логину + паролю (JWT)
- ✅ Список контактов / пользователей системы
- ✅ Личные чаты (1 на 1) с историей сообщений
- ✅ Отправка и получение текстовых сообщений в реальном времени (Socket.io)
- ✅ Отправка изображений и файлов (до 20 МБ)
- ✅ Индикатор «онлайн / офлайн» у пользователей
- ✅ Индикатор «печатает...»
- ✅ Уведомления об ошибках в Telegram (опционально)
- ✅ Резервное копирование БД по расписанию

## Деплой на VPS

Подробная инструкция — в [`DEPLOY.md`](./DEPLOY.md).

Кратко:

```bash
# 1. Скопировать проект на сервер
scp -r . root@YOUR_VPS_IP:/opt/minimessenger

# 2. Настроить .env
cd /opt/minimessenger/backend
cp .env.example .env
nano .env  # заполнить JWT_SECRET, DB_PASSWORD и др.

# 3. Запустить
cd /opt/minimessenger
docker compose up -d --build

# 4. Проверить
docker compose ps
./scripts/health_check.sh
```

## Обслуживание

### Проверка состояния сервисов

```bash
./scripts/health_check.sh
```

### Резервное копирование БД

Вручную:
```bash
./scripts/backup.sh
```

Автоматически (каждый день в 3:00):
```bash
# Добавить в crontab
crontab -e
0 3 * * * /opt/minimessenger/scripts/backup.sh >> /var/log/minimessenger_backup.log 2>&1
```

### Уведомления об ошибках (Telegram)

Для получения уведомений о критических ошибках:

1. Создай бота через [@BotFather](https://t.me/BotFather), получи токен
2. Узнай свой Telegram ID через [@userinfobot](https://t.me/userinfobot)
3. Напиши боту первым сообщением
4. Добавь в `backend/.env`:
   ```env
   TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ADMIN_TELEGRAM_ID=123456789
   ```

## Тесты

```bash
cd backend
npm test               # один прогон
npm run test:watch     # с перезапуском
npm run test:coverage  # с отчётом
```

31 тест покрывают: auth, chats, upload, middleware.

## Документация

| Файл | Описание |
|------|----------|
| [`README.md`](./README.md) | Этот файл — быстрый старт |
| [`DEPLOY.md`](./DEPLOY.md) | Пошаговая инструкция деплоя на VPS |
| [`CLAUDE.md`](./CLAUDE.md) | Архитектура, API, паттерны кода, соглашения |
| [`MEMORY.md`](./MEMORY.md) | Состояние проекта, история изменений, техдолг |
| [`MiniMessenger_Roadmap.md`](./MiniMessenger_Roadmap.md) | Техническое задание и дорожная карта |

## Лицензия

Приватный проект для закрытой группы пользователей.
