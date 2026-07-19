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
git remote set-url origin https://github.com/Nirobo99/VPSVortexM.git 2>/dev/null || true

echo "==> Git sync ($BRANCH) — hard reset tracked files only (NEVER wipe certbot/)"
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
# Discard local edits to tracked files only. Do NOT run `git clean -fd` —
# that deletes certbot/ (gitignored SSL certs) and takes the site offline.
git reset --hard "origin/$BRANCH"
git checkout -- . 2>/dev/null || true

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

if [[ ! -d certbot/conf/live ]]; then
  echo "WARN: certbot/conf/live missing — nginx HTTPS may fail. Will prefer HTTP-only if needed."
fi

if [[ "$(grep -c 'dialog_type' backend/app/models/messaging.py || true)" -gt 1 ]]; then
  echo "WARNING: duplicate dialog_type in messaging.py — fix before continuing."
  exit 1
fi

export BUILD_ID="$HEAD_SHORT"
echo "==> Build ID: $BUILD_ID"

echo "==> Ensure nginx can start (SSL or HTTP-only)"
mkdir -p nginx certbot/conf certbot/www
if [[ -d nginx/nginx.prod.active.conf ]]; then
  echo "WARN: removing docker bind-mount directory artifact nginx/nginx.prod.active.conf"
  rm -rf nginx/nginx.prod.active.conf
fi
if [[ -d certbot/conf/live/vortexm.ru ]] || ls certbot/conf/live/*/fullchain.pem >/dev/null 2>&1; then
  if [[ -f nginx/nginx.prod.conf ]]; then
    DOMAIN="$(basename "$(dirname "$(ls certbot/conf/live/*/fullchain.pem | head -1)")")"
    if [[ "$DOMAIN" == "README" || -z "$DOMAIN" ]]; then DOMAIN=vortexm.ru; fi
    sed "s/YOUR_DOMAIN/$DOMAIN/g" nginx/nginx.prod.conf > nginx/nginx.prod.active.conf
    if [[ ! -f nginx/nginx.prod.active.conf ]]; then
      echo "ERROR: nginx.prod.active.conf is not a file"
      exit 1
    fi
    if grep -q '^NGINX_CONFIG=' .env; then
      sed -i 's|^NGINX_CONFIG=.*|NGINX_CONFIG=./nginx/nginx.prod.active.conf|' .env
    else
      echo 'NGINX_CONFIG=./nginx/nginx.prod.active.conf' >> .env
    fi
  fi
else
  echo "==> No SSL certs — switching to HTTP-only nginx so the site comes up"
  if grep -q '^NGINX_CONFIG=' .env; then
    sed -i 's|^NGINX_CONFIG=.*|NGINX_CONFIG=./nginx/nginx.http-only.conf|' .env
  else
    echo 'NGINX_CONFIG=./nginx/nginx.http-only.conf' >> .env
  fi
fi

echo "==> Rebuild backend + frontend (no cache)"
if ! docker compose -f docker-compose.prod.yml --env-file .env build --no-cache backend frontend; then
  echo "ERROR: docker build failed — attempting emergency restore of existing images..."
  ./scripts/recover-prod.sh || true
  exit 1
fi

echo "==> Recreate app containers (keep postgres/redis/minio running)"
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate backend frontend celery-worker celery-beat
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate nginx

echo "==> Wait for backend"
sleep 12

echo "==> Migrations"
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head || {
  echo "WARN: alembic upgrade failed — check backend logs"
}

echo "==> Health (local)"
curl -sf -o /dev/null -w "local http: %{http_code}\n" http://127.0.0.1/ || true
curl -sf -o /dev/null -w "API health: %{http_code}\n" https://vortexm.ru/api/v1/health || \
  curl -sf -o /dev/null -w "API health (http): %{http_code}\n" http://127.0.0.1/api/v1/health || true

echo "==> Marketplace route check"
MP_CODE="$(curl -s -o /dev/null -w "%{http_code}" https://vortexm.ru/marketplace || true)"
if [[ "$MP_CODE" == "000" || -z "$MP_CODE" ]]; then
  MP_CODE="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/marketplace || true)"
fi
echo "GET /marketplace -> HTTP $MP_CODE (expect 200 or 307/308, not 404)"
if [[ "$MP_CODE" == "404" ]]; then
  echo "ERROR: marketplace page missing — frontend image is still old or build omitted the route."
  echo "  docker compose -f docker-compose.prod.yml logs frontend --tail 120"
  exit 1
fi

echo "==> Done. Commit on server: $HEAD_SHORT"
echo "    If HTTPS still broken: ./scripts/init-ssl.sh vortexm.ru YOUR_EMAIL"
echo "    Hard-refresh browser (Ctrl+Shift+R)."
