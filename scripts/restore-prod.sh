#!/usr/bin/env bash
# Emergency: bring site back online immediately (run on server in /opt/vortexm)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

echo "==> Emergency restore"
docker compose down --remove-orphans 2>/dev/null || true

if [[ -d certbot/conf/live/vortexm.ru ]]; then
  sed "s/YOUR_DOMAIN/vortexm.ru/g" nginx/nginx.prod.conf > nginx/nginx.prod.active.conf
  grep -q '^NGINX_CONFIG=' .env \
    && sed -i 's|^NGINX_CONFIG=.*|NGINX_CONFIG=./nginx/nginx.prod.active.conf|' .env \
    || echo 'NGINX_CONFIG=./nginx/nginx.prod.active.conf' >> .env
fi

export BUILD_ID="$(git rev-parse --short HEAD 2>/dev/null || echo restore)"

echo "==> Start all services (use existing images, no rebuild)"
"${COMPOSE[@]}" up -d postgres redis minio livekit
sleep 12
"${COMPOSE[@]}" up -d backend celery-worker celery-beat

# Start frontend from ANY existing image — do not build here
if docker images --format '{{.Repository}}' | grep -qx 'vortexm-frontend'; then
  "${COMPOSE[@]}" up -d frontend
else
  echo "WARN: no vortexm-frontend image — building minimal frontend (this takes time)..."
  "${COMPOSE[@]}" build frontend
  "${COMPOSE[@]}" up -d frontend
fi

"${COMPOSE[@]}" up -d --force-recreate nginx
sleep 5

"${COMPOSE[@]}" ps
curl -sfI --max-time 15 http://127.0.0.1/ | head -3 || echo "localhost check failed"
echo "Site should be back. For new UI later: ./scripts/fix-frontend-prod.sh"
