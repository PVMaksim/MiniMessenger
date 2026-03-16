#!/bin/bash
# =============================================================================
# Проверка состояния сервисов MiniMessenger
# =============================================================================
# Скрипт проверяет доступность всех сервисов и выводит их статус.
# Используется для мониторинга и отладки.
#
# Использование:
#   ./health_check.sh
# =============================================================================

set -euo pipefail

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ─── Конфигурация ─────────────────────────────────────────────────────────────
PROJECT_NAME="${PROJECT_NAME:-minimessenger}"
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"

# ─── Функции ──────────────────────────────────────────────────────────────────
check_service() {
  local name="$1"
  local url="$2"
  local container="$3"

  echo -n "Проверка ${name}... "

  # Проверка HTTP-эндпоинта
  if [[ -n "$url" ]]; then
    if curl -s --max-time 5 "$url" > /dev/null 2>&1; then
      echo -e "${GREEN}✅ UP${NC} (${url})"
      return 0
    fi
  fi

  # Проверка Docker-контейнера
  if [[ -n "$container" ]]; then
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
      local status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
      if [[ "$status" == "running" ]]; then
        echo -e "${GREEN}✅ Running${NC} (контейнер: ${container})"
        return 0
      else
        echo -e "${YELLOW}⚠️  ${status}${NC} (контейнер: ${container})"
        return 1
      fi
    else
      echo -e "${RED}❌ Контейнер не найден${NC}"
      return 1
    fi
  fi

  echo -e "${RED}❌ Недоступен${NC}"
  return 1
}

check_database() {
  local container="mm_postgres"

  echo -n "Проверка PostgreSQL... "

  if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
    local health=$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
    if [[ "$health" == "healthy" ]]; then
      echo -e "${GREEN}✅ Healthy${NC}"
      return 0
    elif [[ "$health" == "unknown" ]]; then
      # Контейнер без health check
      local status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
      if [[ "$status" == "running" ]]; then
        echo -e "${GREEN}✅ Running${NC} (без health check)"
        return 0
      fi
    fi
    echo -e "${YELLOW}⚠️  ${health}${NC}"
    return 1
  else
    echo -e "${RED}❌ Контейнер не найден${NC}"
    return 1
  fi
}

check_redis() {
  local container="mm_redis"

  echo -n "Проверка Redis... "

  if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
    local status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
    if [[ "$status" == "running" ]]; then
      echo -e "${GREEN}✅ Running${NC}"
      return 0
    fi
    echo -e "${YELLOW}⚠️  ${status}${NC}"
    return 1
  else
    echo -e "${RED}❌ Контейнер не найден${NC}"
    return 1
  fi
}

# ─── Основная проверка ────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════"
echo "  MiniMessenger — Проверка состояния сервисов"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════"
echo ""

FAILED=0

check_database || ((FAILED++))
check_redis || ((FAILED++))
check_service "Backend" "${BACKEND_URL}/health" "mm_backend" || ((FAILED++))
check_service "Frontend" "${FRONTEND_URL}" "mm_frontend" || ((FAILED++))
check_service "Nginx" "" "mm_nginx" || ((FAILED++))

echo ""
echo "═══════════════════════════════════════════════════════════"

if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}✅ Все сервисы работают нормально${NC}"
  exit 0
else
  echo -e "${RED}❌ Проблем с сервисов: ${FAILED}${NC}"
  echo ""
  echo "Полезные команды для отладки:"
  echo "  docker compose ps                    # Статус всех контейнеров"
  echo "  docker compose logs -f backend       # Логи бэкенда"
  echo "  docker compose logs -f nginx         # Логи nginx"
  echo "  ./scripts/backup.sh                  # Создать бэкап БД"
  exit 1
fi
