#!/usr/bin/env bash
# Force production frontend redeploy (fixes old UI / dev turbopack mode)
# Does NOT stop database/backend — site stays partially up during build.
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

echo "==> Stop DEV stack only"
docker compose down --remove-orphans 2>/dev/null || true

echo "==> Sync git to origin/$BRANCH"
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

echo "==> Ensure core services are running"
"${COMPOSE[@]}" up -d postgres redis minio livekit backend celery-worker celery-beat
sleep 5

echo "==> Stop and remove frontend only (backend/nginx stay up)"
"${COMPOSE[@]}" stop frontend 2>/dev/null || true
"${COMPOSE[@]}" rm -f frontend 2>/dev/null || true
docker rm -f vortexm-frontend-1 2>/dev/null || true

echo "==> Build production frontend (Dockerfile.prod, ~3-8 min)"
"${COMPOSE[@]}" build --no-cache frontend

echo "==> Start frontend + reload nginx"
"${COMPOSE[@]}" up -d frontend
"${COMPOSE[@]}" up -d --force-recreate nginx
sleep 10

CID=$("${COMPOSE[@]}" ps -q frontend)
docker inspect "$CID" --format 'Cmd: {{json .Config.Cmd}}'

HTML=$(curl -sf --max-time 25 https://vortexm.ru/ 2>/dev/null || curl -sf --max-time 25 http://127.0.0.1/ 2>/dev/null || echo "")

if echo "$HTML" | grep -q turbopack; then
  echo "FAIL: still DEV mode (turbopack). Run: docker compose down && ./scripts/restore-prod.sh"
  exit 1
fi

if echo "$HTML" | grep -q landing-frame; then
  echo "SUCCESS: new landing page is live"
else
  echo "WARN: landing-frame not found yet — site may still work with old UI"
  "${COMPOSE[@]}" logs frontend --tail 30
fi

echo "Done. Hard-refresh browser: Ctrl+Shift+R"
echo "NEVER run 'docker compose up' — only 'docker compose -f docker-compose.prod.yml ...'"
