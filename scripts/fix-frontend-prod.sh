#!/usr/bin/env bash
# Build and deploy PRODUCTION frontend only (separate image from dev).
# Usage: ./scripts/fix-frontend-prod.sh [branch]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BRANCH="${1:-feature/security-hardening}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)
DEV_COMPOSE=(docker compose -f docker-compose.yml)

if [[ ! -f .env ]]; then
  echo "Error: .env not found"
  exit 1
fi

on_fail() {
  echo ""
  echo "==> FAILED — keeping site on current containers"
  "${COMPOSE[@]}" up -d frontend nginx 2>/dev/null || true
}
trap on_fail ERR

echo "==> Stop DEV stack (vortexm-dev) — it overwrites prod frontend!"
"${DEV_COMPOSE[@]}" down --remove-orphans 2>/dev/null || true

echo "==> Sync git"
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
git log -1 --oneline

if ! grep -q landing-frame frontend/app/page.tsx; then
  echo "ERROR: frontend/app/page.tsx is old on disk"
  exit 1
fi

if [[ -d certbot/conf/live/vortexm.ru ]]; then
  sed "s/YOUR_DOMAIN/vortexm.ru/g" nginx/nginx.prod.conf > nginx/nginx.prod.active.conf
  grep -q '^NGINX_CONFIG=' .env \
    && sed -i 's|^NGINX_CONFIG=.*|NGINX_CONFIG=./nginx/nginx.prod.active.conf|' .env \
    || echo 'NGINX_CONFIG=./nginx/nginx.prod.active.conf' >> .env
fi

export BUILD_ID="$(git rev-parse --short HEAD)"
echo "==> BUILD_ID=$BUILD_ID"

echo "==> Core services up"
"${COMPOSE[@]}" up -d postgres redis minio livekit backend celery-worker celery-beat nginx

echo "==> Build image vortexm-frontend-prod (5-15 min, site stays up)"
BUILD_LOG="/tmp/vortexm-frontend-build-${BUILD_ID}.log"
if ! "${COMPOSE[@]}" build --no-cache frontend 2>&1 | tee "$BUILD_LOG"; then
  echo "BUILD ERROR — last 50 lines:"
  tail -50 "$BUILD_LOG"
  exit 1
fi

echo "==> Deploy production frontend"
"${COMPOSE[@]}" up -d --force-recreate --no-deps frontend
"${COMPOSE[@]}" up -d --force-recreate nginx
sleep 12

trap - ERR

CID=$("${COMPOSE[@]}" ps -q frontend)
echo "Container Cmd: $(docker inspect "$CID" --format '{{json .Config.Cmd}}')"
echo "Container Image: $(docker inspect "$CID" --format '{{.Config.Image}}')"

HTML=$(curl -sf --max-time 25 https://vortexm.ru/ 2>/dev/null || curl -sf --max-time 25 http://127.0.0.1/ 2>/dev/null || echo "")

if echo "$HTML" | grep -q turbopack; then
  echo "FAIL: still DEV mode (turbopack in HTML)"
  echo "Check: docker compose -f docker-compose.yml ps  (dev must be empty)"
  exit 1
fi

if echo "$HTML" | grep -q landing-frame; then
  echo "SUCCESS: new design is live (landing-frame found)"
else
  echo "FAIL: landing-frame not found"
  exit 1
fi

echo "Done. Browser: Ctrl+Shift+R"
echo "Never run: docker compose up -d  (without -f docker-compose.prod.yml)"
