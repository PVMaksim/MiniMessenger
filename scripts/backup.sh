#!/bin/bash
# =============================================================================
# Резервное копирование базы данных MiniMessenger
# =============================================================================
# Скрипт создаёт дамп PostgreSQL, сжимает его и сохраняет в указанную директорию.
# Старые бэкапы (старше 7 дней) автоматически удаляются.
#
# Использование:
#   ./backup.sh
#
# Настройка cron (ежедневно в 3:00):
#   0 3 * * * /opt/minimessenger/scripts/backup.sh >> /var/log/minimessenger_backup.log 2>&1
# =============================================================================

set -euo pipefail

# ─── Переменные окружения ─────────────────────────────────────────────────────
# Можно задать в .env файле или передать при вызове
# Пример: DB_PASSWORD=mypassword ./backup.sh

PROJECT_NAME="${PROJECT_NAME:-minimessenger}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/${PROJECT_NAME}}"

# Параметры PostgreSQL
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-minimessenger}"
DB_USER="${DB_USER:-mmuser}"
# DB_PASSWORD должен быть задан через переменную окружения или .pgpass

# Telegram-уведомления (опционально)
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
ADMIN_TELEGRAM_ID="${ADMIN_TELEGRAM_ID:-}"

# ─── Логирование ──────────────────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# ─── Создание директории для бэкапов ──────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

# ─── Имя файла бэкапа ─────────────────────────────────────────────────────────
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/db_${DATE}.sql.gz"

log "Начало бэкапа базы данных '${DB_NAME}'..."
log "Хост: ${DB_HOST}:${DB_PORT}, Пользователь: ${DB_USER}"

# ─── Дамп базы данных ─────────────────────────────────────────────────────────
# Используем pg_dump через docker exec, если БД в контейнере
# Определяем, запущен ли контейнер с PostgreSQL

CONTAINER_NAME="mm_postgres"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log "Обнаружен Docker-контейнер ${CONTAINER_NAME}, используем pg_dump из контейнера..."
  
  docker exec -e PGPASSWORD="$DB_PASSWORD" \
    "${CONTAINER_NAME}" \
    pg_dump -h localhost -U "${DB_USER}" "${DB_NAME}" \
    | gzip > "$BACKUP_FILE"
else
  log "Docker-контейнер не найден, используем локальный pg_dump..."
  
  PGPASSWORD="${DB_PASSWORD}" \
    pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${DB_NAME}" \
    | gzip > "$BACKUP_FILE"
fi

# ─── Проверка успешности ──────────────────────────────────────────────────────
if [[ -f "$BACKUP_FILE" && -s "$BACKUP_FILE" ]]; then
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  log "✅ Бэкап успешно создан: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
  log "❌ Ошибка: файл бэкапа не создан или пуст"
  exit 1
fi

# ─── Удаление старых бэкапов ──────────────────────────────────────────────────
log "Удаление бэкапов старше 7 дней..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +7 | wc -l | tr -d ' ')

if [[ "$DELETED_COUNT" -gt 0 ]]; then
  find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +7 -delete
  log "Удалено старых бэкапов: ${DELETED_COUNT}"
else
  log "Старых бэкапов для удаления не найдено"
fi

# ─── Список текущих бэкапов ───────────────────────────────────────────────────
log "Текущие бэкапы в директории ${BACKUP_DIR}:"
ls -lht "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -10 || log "Бэкапы не найдены"

# ─── Telegram-уведомление (опционально) ───────────────────────────────────────
send_telegram_notification() {
  if [[ -z "$TELEGRAM_BOT_TOKEN" || -z "$ADMIN_TELEGRAM_ID" ]]; then
    return 0
  fi

  local message="✅ <b>Бэкап MiniMessenger выполнен</b>\n"
  message+="📁 Файл: <code>$(basename "$BACKUP_FILE")</code>\n"
  message+="📊 Размер: ${BACKUP_SIZE}\n"
  message+="⏰ $(date '+%Y-%m-%d %H:%M:%S')"

  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="${ADMIN_TELEGRAM_ID}" \
    -d text="$message" \
    -d parse_mode="HTML" > /dev/null || true
}

send_telegram_notification

log "Бэкап завершён"
