# nginx/Dockerfile
#
# Двухстадийная сборка: сначала собираем React, потом кладём в nginx.
# Это чище чем shared volume — нет race condition и лишних контейнеров.

# ── Стадия 1: Vite-сборка фронтенда ─────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Копируем package.json первым — слой кэшируется пока зависимости не менялись
COPY frontend/package*.json ./
RUN npm ci

# Копируем исходники и собираем
COPY frontend/ .
RUN npm run build
# Результат: /app/dist/

# ── Стадия 2: финальный nginx-образ со статикой ──────────────────────────────
FROM nginx:alpine

# Собранный React
COPY --from=frontend-builder /app/dist /var/www/frontend

# Nginx-конфиг (монтируется снаружи в docker-compose, но добавляем как fallback)
# Основной конфиг всё равно придёт через volume mount в docker-compose

EXPOSE 80 443
