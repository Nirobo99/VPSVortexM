#!/usr/bin/env bash
# Update running VortexM production from git (run on the server in /opt/vortexm).
# Usage: ./scripts/update-prod.sh [git-branch]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BRANCH="${1:-feature/security-hardening}"

if [[ ! -f .env ]]; then
  echo "Error: .env not found in $ROOT"
  exit 1
fi

echo "==> Backup .env"
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

echo "==> Git pull ($BRANCH)"
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
git pull origin "$BRANCH"

echo "==> Current commit"
git log -1 --oneline

if [[ "$(grep -c 'dialog_type' backend/app/models/messaging.py || true)" -gt 1 ]]; then
  echo "WARNING: duplicate dialog_type in messaging.py — fix before continuing."
  exit 1
fi

export BUILD_ID="$(git rev-parse --short HEAD)"
echo "==> Build ID: $BUILD_ID"

echo "==> Rebuild backend + frontend (no cache)"
docker compose -f docker-compose.prod.yml --env-file .env build --no-cache backend frontend

echo "==> Recreate containers"
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate backend frontend celery-worker celery-beat
docker compose -f docker-compose.prod.yml restart nginx

echo "==> Wait for backend"
sleep 8

echo "==> Health"
curl -sf -o /dev/null -w "API health: %{http_code}\n" https://vortexm.ru/api/v1/health || true

echo "==> Frontend marker (animated landing = new UI)"
if curl -sf https://vortexm.ru/ | grep -q 'animated-bg'; then
  echo "OK: new frontend detected (animated-bg)"
else
  echo "WARN: animated-bg not found — frontend may still be old."
  echo "  Try: docker compose -f docker-compose.prod.yml logs frontend --tail 80"
fi

echo "==> Done. Hard-refresh browser (Ctrl+Shift+R) or clear site data if UI is stale."
