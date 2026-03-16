# 🚀 Деплой MiniMessenger на VPS

**Требования:** Ubuntu 22.04, 2 ГБ RAM, домен направленный на IP сервера.

---

## Шаг 1 — Установка Docker

```bash
ssh root@YOUR_SERVER_IP
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

---

## Шаг 2 — Копируем проект

```bash
# Вариант А — git
git clone https://github.com/YOUR_USERNAME/minimessenger.git
cd minimessenger

# Вариант Б — с локальной машины
scp -r ./MiniMessenger root@YOUR_SERVER_IP:/root/minimessenger
```

---

## Шаг 3 — Настраиваем окружение

```bash
cd /root/minimessenger/backend
cp .env.example .env
nano .env
```

Обязательно заменить в `.env`:

| Переменная | Что поставить |
|-----------|---------------|
| `JWT_SECRET` | 64 случайных символа (см. ниже) |
| `DB_PASSWORD` | Придумай сложный пароль |
| `REDIS_PASSWORD` | Придумай сложный пароль |
| `CLIENT_URL` | `https://yourdomain.com` |
| `NODE_ENV` | `production` |

Генерация JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Шаг 4 — Настраиваем nginx

```bash
# Заменяем YOUR_DOMAIN на свой домен во всех вхождениях
sed -i 's/YOUR_DOMAIN/yourdomain.com/g' nginx/nginx.conf
```

---

## Шаг 5 — Получаем SSL-сертификат

```bash
apt install certbot -y
# nginx ещё не запущен, порт 80 свободен
certbot certonly --standalone -d yourdomain.com

# Автообновление раз в 90 дней
echo "0 3 * * * certbot renew --quiet && docker compose -f /root/minimessenger/docker-compose.yml restart nginx" | crontab -
```

> Если домена нет — убери HTTPS-блок из `nginx.conf` и оставь только HTTP на порту 80.

---

## Шаг 6 — Запуск

```bash
cd /root/minimessenger
docker compose up -d --build
docker compose logs -f   # смотрим запуск
```

Ждём статус `healthy` у всех сервисов (~1-2 минуты):

```bash
docker compose ps
```

Ожидаемый результат:
```
mm_postgres   Up (healthy)
mm_redis      Up (healthy)
mm_backend    Up (healthy)
mm_nginx      Up (healthy)
```

---

## Шаг 7 — Проверяем

```bash
curl https://yourdomain.com/health
# {"status":"ok","time":"..."}
```

Открываем браузер: `https://yourdomain.com` → экран входа ✅

---

## Полезные команды

```bash
docker compose logs -f backend      # логи бэкенда
docker compose logs -f nginx        # логи nginx
docker compose restart backend      # рестарт без пересборки
docker compose up -d --build nginx  # пересобрать nginx (после изменения фронта)
docker compose down                 # остановить всё (данные сохранятся)
```

## Бэкап БД

```bash
# Создать дамп
docker exec mm_postgres pg_dump -U $DB_USER minimessenger > backup_$(date +%Y%m%d).sql

# Автобэкап ежедневно в 2:00
mkdir -p /root/backups
echo "0 2 * * * docker exec mm_postgres pg_dump -U mmuser minimessenger > /root/backups/mm_\$(date +\%Y\%m\%d).sql" | crontab -
```

## Обновление кода

```bash
git pull
# Если менялся фронтенд или nginx:
docker compose up -d --build nginx
# Если менялся только бэкенд:
docker compose up -d --build backend
```

## Частые проблемы

| Симптом | Причина | Решение |
|---------|---------|---------|
| Backend не стартует | Неверный `.env` | `docker compose logs backend` → читаем ошибку |
| JWT_SECRET невалидна | Остался placeholder | Сгенерируй новый секрет |
| Redis auth failed | Нет `REDIS_PASSWORD` в `.env` | Добавь переменную |
| 502 Bad Gateway | Backend не поднялся | `docker compose ps` + `logs backend` |
| Пустой экран | Ошибка сборки фронта | `docker compose logs nginx` при сборке |
