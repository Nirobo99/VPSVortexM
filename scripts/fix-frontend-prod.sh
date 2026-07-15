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

echo "==> Stop ALL stacks (dev compose runs npm run dev and breaks production UI)"
docker compose down --remove-orphans 2>/dev/null || true
docker compose -f docker-compose.prod.yml --env-file .env down --remove-orphans 2>/dev/null || true
docker rm -f vortexm-frontend-1 2>/dev/null || true

echo "==> Remove old frontend images"
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep 'vortexm-frontend' | awk '{print $2}' | xargs -r docker rmi -f 2>/dev/null || true

echo "==> Sync git to origin/$BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
git log -1 --oneline

if ! grep -q landing-frame frontend/app/page.tsx; then
  echo "ERROR: frontend/app/page.tsx still old after git reset"
  exit 1
fi

# Regenerate HTTPS nginx config if certs exist
if [[ -d certbot/conf/live/vortexm.ru ]]; then
  sed "s/YOUR_DOMAIN/vortexm.ru/g" nginx/nginx.prod.conf > nginx/nginx.prod.active.conf
  grep -q '^NGINX_CONFIG=' .env \
    && sed -i 's|^NGINX_CONFIG=.*|NGINX_CONFIG=./nginx/nginx.prod.active.conf|' .env \
    || echo 'NGINX_CONFIG=./nginx/nginx.prod.active.conf' >> .env
fi

export BUILD_ID="$(git rev-parse --short HEAD)"
echo "==> BUILD_ID=$BUILD_ID"

echo "==> Build production frontend (Dockerfile.prod, ~3-8 min)"
docker compose -f docker-compose.prod.yml --env-file .env build --no-cache frontend

echo "==> Start full production stack"
docker compose -f docker-compose.prod.yml --env-file .env up -d

echo "==> Verify frontend process (must be 'node server.js', NOT 'npm run dev')"
sleep 8
CID=$(docker compose -f docker-compose.prod.yml --env-file .env ps -q frontend)
docker inspect "$CID" --format 'Cmd: {{json .Config.Cmd}}'
docker exec "$CID" ps aux 2>/dev/null | head -5 || true

HTML=$(curl -sf --max-time 25 https://vortexm.ru/ 2>/dev/null || curl -sf --max-time 25 http://127.0.0.1/ 2>/dev/null || echo "")

if echo "$HTML" | grep -q turbopack; then
  echo "FAIL: site still in DEV mode (turbopack in HTML)"
  echo "You may have started 'docker compose up' without -f docker-compose.prod.yml"
  docker compose -f docker-compose.prod.yml --env-file .env ps
  exit 1
fi

if echo "$HTML" | grep -q landing-frame; then
  echo "SUCCESS: new landing page is live (landing-frame found)"
else
  echo "FAIL: landing-frame not in HTML"
  docker compose -f docker-compose.prod.yml --env-file .env logs frontend --tail 40
  exit 1
fi

echo "Done. Hard-refresh browser: Ctrl+Shift+R"
echo "NEVER run 'docker compose up' on server — only 'docker compose -f docker-compose.prod.yml ...'"
