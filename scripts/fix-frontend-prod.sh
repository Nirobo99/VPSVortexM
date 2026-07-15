#!/usr/bin/env bash
# Force production frontend redeploy (fixes old UI / dev turbopack mode)
# Site stays online during build — old frontend is replaced only after success.
# Usage: ./scripts/fix-frontend-prod.sh [branch]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BRANCH="${1:-feature/security-hardening}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

if [[ ! -f .env ]]; then
  echo "Error: .env not found"
  exit 1
fi

on_fail() {
  echo ""
  echo "==> BUILD FAILED — restoring site with last working frontend"
  "${COMPOSE[@]}" up -d frontend nginx backend 2>/dev/null || true
  echo "Run: docker compose -f docker-compose.prod.yml logs frontend --tail 50"
  echo "Or emergency: ./scripts/restore-prod.sh"
}
trap on_fail ERR

echo "==> Stop DEV stack only"
docker compose down --remove-orphans 2>/dev/null || true

echo "==> Sync git"
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
git log -1 --oneline

if ! grep -q landing-frame frontend/app/page.tsx; then
  echo "ERROR: frontend/app/page.tsx still old after git reset"
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

echo "==> Keep core services running"
"${COMPOSE[@]}" up -d postgres redis minio livekit backend celery-worker celery-beat nginx frontend

echo "==> Build NEW production frontend (old container still serves traffic, ~5-15 min)"
echo "    If npm fails, site will NOT be taken down."
BUILD_LOG="/tmp/vortexm-frontend-build-${BUILD_ID}.log"
if ! "${COMPOSE[@]}" build --no-cache frontend 2>&1 | tee "$BUILD_LOG"; then
  echo "ERROR: docker build failed. Last 40 lines:"
  tail -40 "$BUILD_LOG"
  exit 1
fi

echo "==> Swap to new frontend image"
"${COMPOSE[@]}" up -d --force-recreate frontend
"${COMPOSE[@]}" up -d --force-recreate nginx
sleep 12

trap - ERR

CID=$("${COMPOSE[@]}" ps -q frontend)
docker inspect "$CID" --format 'Cmd: {{json .Config.Cmd}}'

HTML=$(curl -sf --max-time 25 https://vortexm.ru/ 2>/dev/null || curl -sf --max-time 25 http://127.0.0.1/ 2>/dev/null || echo "")

if echo "$HTML" | grep -q turbopack; then
  echo "FAIL: still DEV mode (turbopack)"
  exit 1
fi

if echo "$HTML" | grep -q landing-frame; then
  echo "SUCCESS: new landing page is live"
else
  echo "WARN: landing-frame not in HTML — build may have succeeded but check manually"
  "${COMPOSE[@]}" logs frontend --tail 30
fi

echo "Done. Hard-refresh browser: Ctrl+Shift+R"
echo "NEVER run 'docker compose up' — only 'docker compose -f docker-compose.prod.yml ...'"
