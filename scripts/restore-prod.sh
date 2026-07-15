#!/usr/bin/env bash
# Emergency: bring production site back online (run on server in /opt/vortexm)
# Usage: ./scripts/restore-prod.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Error: .env not found"
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

echo "==> Stop DEV stack only (never use docker compose up without -f prod)"
docker compose down --remove-orphans 2>/dev/null || true

echo "==> Regenerate nginx HTTPS config"
if [[ -d certbot/conf/live/vortexm.ru ]]; then
  sed "s/YOUR_DOMAIN/vortexm.ru/g" nginx/nginx.prod.conf > nginx/nginx.prod.active.conf
  grep -q '^NGINX_CONFIG=' .env \
    && sed -i 's|^NGINX_CONFIG=.*|NGINX_CONFIG=./nginx/nginx.prod.active.conf|' .env \
    || echo 'NGINX_CONFIG=./nginx/nginx.prod.active.conf' >> .env
else
  echo "WARN: no SSL certs — using http-only nginx"
  export NGINX_CONFIG=./nginx/nginx.http-only.conf
fi

export BUILD_ID="$(git rev-parse --short HEAD 2>/dev/null || echo restore)"

echo "==> Start infrastructure"
"${COMPOSE[@]}" up -d postgres redis minio livekit
echo "Waiting for postgres/redis/minio..."
sleep 12

echo "==> Start backend workers"
"${COMPOSE[@]}" up -d backend celery-worker celery-beat
sleep 8

echo "==> Start frontend (build if image missing)"
if [[ -z "$("${COMPOSE[@]}" images -q frontend 2>/dev/null || true)" ]]; then
  echo "Frontend image missing — building (may take several minutes)..."
  "${COMPOSE[@]}" build frontend
fi
"${COMPOSE[@]}" up -d frontend

echo "==> Start nginx"
"${COMPOSE[@]}" up -d --force-recreate nginx
sleep 5

echo "==> Status"
"${COMPOSE[@]}" ps

echo ""
echo "==> nginx logs"
"${COMPOSE[@]}" logs nginx --tail 15

echo ""
echo "==> HTTP check"
curl -sfI --max-time 15 http://127.0.0.1/ | head -5 || echo "FAIL: localhost not responding"
curl -sfI --max-time 15 https://vortexm.ru/ 2>/dev/null | head -5 || true

echo ""
echo "Restore finished. If site still down, send: docker compose -f docker-compose.prod.yml ps && docker compose -f docker-compose.prod.yml logs nginx --tail 30"
