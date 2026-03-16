# backend/Dockerfile

# ── Стадия 1: зависимости ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# --omit=dev исключает devDependencies (nodemon, jest, supertest)
RUN npm ci --omit=dev

# ── Стадия 2: финальный образ ────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Копируем только нужное
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

# Создаём папку для загруженных файлов
RUN mkdir -p uploads

# Не запускаем от root — безопаснее
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "src/server.js"]
