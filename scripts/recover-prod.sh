#!/usr/bin/env bash
# Emergency: bring vortexm.ru back online NOW (no git clean, no cert wipe).
# Usage: ./scripts/recover-prod.sh
# Optional: REBUILD=1 ./scripts/recover-prod.sh   # also rebuild marketplace frontend

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

if [[ ! -f .env ]]; then
  echo "Error: .env not found in $ROOT"
  exit 1
fi

echo "==> Emergency recover at $ROOT"
echo "==> Stop accidental DEV stack (if any)"
docker compose -f docker-compose.yml down --remove-orphans 2>/dev/null || true

echo "==> SSL / nginx config"
mkdir -p certbot/conf certbot/www nginx
# If host path was missing, Docker may have created a directory mount target.
if [[ -d nginx/nginx.prod.active.conf ]]; then
  echo "WARN: nginx.prod.active.conf is a directory (docker bind mount artifact) — removing"
  rm -rf nginx/nginx.prod.active.conf
fi
if [[ -d certbot/conf/live ]] && ls certbot/conf/live/*/fullchain.pem >/dev/null 2>&1; then
  DOMAIN="$(basename "$(dirname "$(ls certbot/conf/live/*/fullchain.pem | head -1)")")"
  echo "OK: found certs for $DOMAIN"
  sed "s/YOUR_DOMAIN/$DOMAIN/g" nginx/nginx.prod.conf > nginx/nginx.prod.active.conf
  if [[ ! -f nginx/nginx.prod.active.conf ]]; then
    echo "ERROR: failed to write nginx.prod.active.conf as a file"
    exit 1
  fi
  if grep -q '^NGINX_CONFIG=' .env; then
    sed -i 's|^NGINX_CONFIG=.*|NGINX_CONFIG=./nginx/nginx.prod.active.conf|' .env
  else
    echo 'NGINX_CONFIG=./nginx/nginx.prod.active.conf' >> .env
  fi
else
  echo "WARN: SSL certs missing (certbot wiped or never issued)."
  echo "      Starting with HTTP-only so the site responds on :80"
  if grep -q '^NGINX_CONFIG=' .env; then
    sed -i 's|^NGINX_CONFIG=.*|NGINX_CONFIG=./nginx/nginx.http-only.conf|' .env
  else
    echo 'NGINX_CONFIG=./nginx/nginx.http-only.conf' >> .env
  fi
fi

export BUILD_ID="$(git rev-parse --short HEAD 2>/dev/null || echo recover)"

echo "==> Start infrastructure"
"${COMPOSE[@]}" up -d postgres redis minio
sleep 8
"${COMPOSE[@]}" up -d livekit minio-init 2>/dev/null || true

echo "==> Start backend + workers"
"${COMPOSE[@]}" up -d backend celery-worker celery-beat
sleep 8

echo "==> Start frontend"
if [[ "${REBUILD:-0}" == "1" ]]; then
  echo "==> Rebuild frontend+backend (marketplace)"
  "${COMPOSE[@]}" build backend frontend
fi
if ! docker image inspect vortexm-frontend-prod >/dev/null 2>&1; then
  echo "==> No frontend image — building..."
  "${COMPOSE[@]}" build frontend
fi
"${COMPOSE[@]}" up -d frontend

echo "==> Start nginx"
"${COMPOSE[@]}" up -d --force-recreate nginx
sleep 5

echo "==> Status"
"${COMPOSE[@]}" ps

echo "==> Local checks"
curl -sfI --max-time 10 http://127.0.0.1/ | head -5 || echo "FAIL: http://127.0.0.1/ not responding"
curl -sf --max-time 10 http://127.0.0.1/api/v1/health || echo "WARN: API health failed"

echo ""
echo "If site is up on HTTP but HTTPS is dead, re-issue SSL:"
echo "  ./scripts/init-ssl.sh vortexm.ru YOUR_EMAIL"
echo ""
echo "To deploy marketplace after site is up:"
echo "  git fetch origin && git reset --hard origin/feature/security-hardening"
echo "  REBUILD=1 ./scripts/recover-prod.sh"
echo "  # or: ./scripts/update-prod.sh feature/security-hardening"
