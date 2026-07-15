#!/usr/bin/env bash
# Force production frontend redeploy (fixes old UI / dev turbopack mode)
# Usage: ./scripts/fix-frontend-prod.sh [branch]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BRANCH="${1:-feature/security-hardening}"

if [[ ! -f .env ]]; then
  echo "Error: .env not found"
  exit 1
fi

echo "==> Stop accidental DEV stack (docker-compose.yml uses npm run dev)"
docker compose down 2>/dev/null || true

echo "==> Sync git to origin/$BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
git log -1 --oneline

if ! grep -q landing-frame frontend/app/page.tsx; then
  echo "ERROR: frontend/app/page.tsx still old after git reset"
  exit 1
fi

export BUILD_ID="$(git rev-parse --short HEAD)"
echo "==> BUILD_ID=$BUILD_ID"

echo "==> Remove old frontend image/container"
docker compose -f docker-compose.prod.yml --env-file .env stop frontend 2>/dev/null || true
docker compose -f docker-compose.prod.yml --env-file .env rm -f frontend 2>/dev/null || true
FE_IMG=$(docker compose -f docker-compose.prod.yml --env-file .env images -q frontend 2>/dev/null || true)
if [[ -n "$FE_IMG" ]]; then
  docker rmi -f $FE_IMG 2>/dev/null || true
fi

echo "==> Build production frontend (Dockerfile.prod, ~3-8 min)"
docker compose -f docker-compose.prod.yml --env-file .env build --no-cache frontend

echo "==> Start frontend + nginx"
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate frontend nginx

echo "==> Wait..."
sleep 10

HTML=$(curl -sf --max-time 20 https://vortexm.ru/ 2>/dev/null || curl -sf --max-time 20 http://127.0.0.1/ 2>/dev/null || echo "")

if echo "$HTML" | grep -q turbopack; then
  echo "FAIL: site still in dev mode (turbopack). Check: docker compose ps"
  exit 1
fi

if echo "$HTML" | grep -q landing-frame; then
  echo "SUCCESS: new landing page is live (landing-frame found)"
else
  echo "WARN: landing-frame not in HTML yet — check logs:"
  docker compose -f docker-compose.prod.yml logs frontend --tail 40
  exit 1
fi

echo "Done. Hard-refresh browser: Ctrl+Shift+R"
