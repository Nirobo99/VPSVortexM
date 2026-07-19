#!/usr/bin/env bash
# One-shot: bring VortexM back online + marketplace. Run on server:
#   curl -fsSL not needed — use local after git pull
#   bash scripts/fix-site-now.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)
BRANCH="${1:-feature/security-hardening}"

echo "========================================"
echo " VortexM FIX SITE NOW"
echo "========================================"

if [[ ! -f .env ]]; then
  echo "FATAL: .env missing in $ROOT"
  exit 1
fi

echo "==> 1) Sync code (tracked files only, keep certbot + .env)"
git remote set-url origin https://github.com/Nirobo99/VPSVortexM.git 2>/dev/null || true
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
chmod +x scripts/*.sh || true

HEAD="$(git rev-parse --short HEAD)"
export BUILD_ID="$HEAD"
echo "    commit=$HEAD"

echo "==> 2) Stop DEV compose if it stole ports"
docker compose -f docker-compose.yml down --remove-orphans 2>/dev/null || true

echo "==> 3) Prepare nginx config"
mkdir -p certbot/conf certbot/www
CERT=""
if ls certbot/conf/live/*/fullchain.pem >/dev/null 2>&1; then
  CERT="$(ls certbot/conf/live/*/fullchain.pem | head -1)"
  DOMAIN="$(basename "$(dirname "$CERT")")"
  echo "    SSL certs OK for $DOMAIN"
  sed "s/YOUR_DOMAIN/$DOMAIN/g" nginx/nginx.prod.conf > nginx/nginx.prod.active.conf
  # Fail hard if placeholder left
  if grep -q YOUR_DOMAIN nginx/nginx.prod.active.conf; then
    echo "FATAL: YOUR_DOMAIN still in nginx.prod.active.conf"
    exit 1
  fi
  if grep -q '^NGINX_CONFIG=' .env; then
    sed -i 's|^NGINX_CONFIG=.*|NGINX_CONFIG=./nginx/nginx.prod.active.conf|' .env
  else
    echo 'NGINX_CONFIG=./nginx/nginx.prod.active.conf' >> .env
  fi
else
  echo "    WARN: no SSL — HTTP-only"
  if grep -q '^NGINX_CONFIG=' .env; then
    sed -i 's|^NGINX_CONFIG=.*|NGINX_CONFIG=./nginx/nginx.http-only.conf|' .env
  else
    echo 'NGINX_CONFIG=./nginx/nginx.http-only.conf' >> .env
  fi
fi
echo "    NGINX_CONFIG=$(grep '^NGINX_CONFIG=' .env | tail -1)"

echo "==> 4) Start ALL services (existing images first — site up fast)"
"${COMPOSE[@]}" up -d postgres redis minio
sleep 5
"${COMPOSE[@]}" up -d livekit 2>/dev/null || true
"${COMPOSE[@]}" up -d backend celery-worker celery-beat frontend
"${COMPOSE[@]}" up -d --force-recreate nginx
sleep 4

echo "==> 5) Port check"
ss -tlnp | grep -E ':80|:443' || netstat -tlnp 2>/dev/null | grep -E ':80|:443' || true
"${COMPOSE[@]}" ps

echo "==> 6) Local HTTP check"
if ! curl -sfI --max-time 8 http://127.0.0.1/ >/dev/null; then
  echo "    nginx not answering — logs:"
  "${COMPOSE[@]}" logs nginx --tail 40 || true
  echo "    Trying HTTP-only fallback..."
  if grep -q '^NGINX_CONFIG=' .env; then
    sed -i 's|^NGINX_CONFIG=.*|NGINX_CONFIG=./nginx/nginx.http-only.conf|' .env
  else
    echo 'NGINX_CONFIG=./nginx/nginx.http-only.conf' >> .env
  fi
  "${COMPOSE[@]}" up -d --force-recreate nginx
  sleep 3
  curl -sfI --max-time 8 http://127.0.0.1/ | head -5 || {
    echo "FATAL: still no HTTP on :80"
    "${COMPOSE[@]}" logs nginx --tail 60
    exit 1
  }
fi
echo "    OK: local HTTP works"

echo "==> 7) Rebuild marketplace (backend + frontend)"
"${COMPOSE[@]}" build backend frontend
"${COMPOSE[@]}" up -d --force-recreate backend frontend celery-worker celery-beat
"${COMPOSE[@]}" up -d --force-recreate nginx
sleep 10

echo "==> 8) Migrations"
"${COMPOSE[@]}" exec -T backend alembic upgrade head || echo "WARN: alembic failed"

echo "==> 9) Final checks"
echo -n "    local / -> "; curl -s -o /dev/null -w "%{http_code}\n" --max-time 8 http://127.0.0.1/ || echo fail
echo -n "    local /marketplace -> "; curl -s -o /dev/null -w "%{http_code}\n" --max-time 8 http://127.0.0.1/marketplace || echo fail
echo -n "    local /api/v1/health -> "; curl -s --max-time 8 http://127.0.0.1/api/v1/health || echo fail
echo -n "    build meta: "; curl -s --max-time 8 http://127.0.0.1/ | grep -o 'vortexm-build" content="[^"]*"' || echo "(none)"
ss -tlnp | grep -E ':80|:443' || true
"${COMPOSE[@]}" ps

echo ""
echo "DONE. commit=$HEAD"
echo "Open https://vortexm.ru (Ctrl+Shift+R)."
echo "If HTTPS fails but HTTP works: ./scripts/init-ssl.sh vortexm.ru YOUR_EMAIL"
