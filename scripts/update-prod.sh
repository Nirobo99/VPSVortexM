#!/usr/bin/env bash
# Update running VortexM production from git (run on the server in /opt/vortexm).
# Usage: ./scripts/update-prod.sh [git-branch]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BRANCH="${1:-feature/security-hardening}"
EXPECTED_MIN_COMMIT="${EXPECTED_MIN_COMMIT:-f39abe7}"

if [[ ! -f .env ]]; then
  echo "Error: .env not found in $ROOT"
  exit 1
fi

echo "==> Backup .env"
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

echo "==> Git remote"
git remote -v || true
# Prefer the current GitHub repo name (without trailing dash)
git remote set-url origin https://github.com/Nirobo99/VPSVortexM.git 2>/dev/null || true

echo "==> Git pull ($BRANCH) — hard reset to origin (discard local server drift)"
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd -e .env -e '.env.backup.*' -e uploads -e media -e data

echo "==> Current commit"
git log -1 --oneline
HEAD_SHORT="$(git rev-parse --short HEAD)"
echo "HEAD=$HEAD_SHORT"

if ! git merge-base --is-ancestor "$EXPECTED_MIN_COMMIT" HEAD 2>/dev/null; then
  echo "ERROR: server does not contain required commit $EXPECTED_MIN_COMMIT"
  echo "  Remote may be wrong or fetch failed. Check: git remote -v && git fetch origin"
  exit 1
fi

echo "==> Preflight: marketplace sources must exist in the tree"
for f in \
  frontend/app/marketplace/page.tsx \
  frontend/components/layout/AppShell.tsx \
  backend/app/api/stickers.py \
  backend/alembic/versions/022_sticker_marketplace.py
do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: missing $f — wrong commit/checkout"
    exit 1
  fi
done
if ! grep -q 'href: "/marketplace"' frontend/components/layout/AppShell.tsx; then
  echo "ERROR: AppShell has no marketplace nav — old tree"
  exit 1
fi
echo "OK: marketplace sources present"

if [[ "$(grep -c 'dialog_type' backend/app/models/messaging.py || true)" -gt 1 ]]; then
  echo "WARNING: duplicate dialog_type in messaging.py — fix before continuing."
  exit 1
fi

export BUILD_ID="$HEAD_SHORT"
echo "==> Build ID: $BUILD_ID"

echo "==> Rebuild backend + frontend (no cache)"
if ! docker compose -f docker-compose.prod.yml --env-file .env build --no-cache --pull backend frontend; then
  echo "ERROR: docker build failed — old containers were NOT replaced."
  echo "  Fix the build error above, then re-run this script."
  exit 1
fi

echo "==> Recreate containers"
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate backend frontend celery-worker celery-beat
docker compose -f docker-compose.prod.yml restart nginx

echo "==> Wait for backend"
sleep 12

echo "==> Migrations"
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head || {
  echo "WARN: alembic upgrade failed — check backend logs"
}

echo "==> Health"
curl -sf -o /dev/null -w "API health: %{http_code}\n" https://vortexm.ru/api/v1/health || true

echo "==> Frontend marker (animated landing = new UI)"
if curl -sf https://vortexm.ru/ | grep -q 'animated-bg'; then
  echo "OK: new frontend detected (animated-bg)"
else
  echo "WARN: animated-bg not found — frontend may still be old."
  echo "  Try: docker compose -f docker-compose.prod.yml logs frontend --tail 80"
fi

echo "==> Marketplace route check"
MP_CODE="$(curl -s -o /dev/null -w "%{http_code}" https://vortexm.ru/marketplace || true)"
echo "GET /marketplace -> HTTP $MP_CODE (expect 200 or 307/308, not 404)"
if [[ "$MP_CODE" == "404" ]]; then
  echo "ERROR: marketplace page missing — frontend image is still old or build omitted the route."
  echo "  docker compose -f docker-compose.prod.yml logs frontend --tail 120"
  echo "  docker compose -f docker-compose.prod.yml images frontend"
  exit 1
fi

echo "==> Done. Commit on server: $HEAD_SHORT"
echo "    Hard-refresh browser (Ctrl+Shift+R) after deploy."
