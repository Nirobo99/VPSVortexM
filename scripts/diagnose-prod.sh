#!/usr/bin/env bash
# Quick production diagnostics — run on server in /opt/vortexm
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BRANCH="${1:-feature/security-hardening}"

echo "========== VortexM diagnose =========="
echo "Path: $ROOT"
echo ""

echo "--- Git ---"
git branch --show-current 2>/dev/null || echo "not a git repo?"
git log -1 --oneline 2>/dev/null || true
git status -sb 2>/dev/null | head -3
if git rev-parse "origin/$BRANCH" >/dev/null 2>&1; then
  LOCAL="$(git rev-parse HEAD)"
  REMOTE="$(git rev-parse "origin/$BRANCH")"
  if [[ "$LOCAL" != "$REMOTE" ]]; then
    echo "WARN: local HEAD != origin/$BRANCH (need git pull)"
  else
    echo "OK: synced with origin/$BRANCH"
  fi
fi
test -f frontend/app/page.tsx && grep -q landing-frame frontend/app/page.tsx && echo "OK: page.tsx has landing-frame" || echo "FAIL: page.tsx is OLD on disk"
echo ""

echo "--- Docker compose ---"
docker compose -f docker-compose.prod.yml ps 2>/dev/null || echo "prod compose not running"
echo ""
docker compose ps 2>/dev/null | head -10 || true
echo ""

echo "--- Frontend container ---"
CID=$(docker compose -f docker-compose.prod.yml ps -q frontend 2>/dev/null || true)
if [[ -n "$CID" ]]; then
  docker inspect "$CID" --format 'Image: {{.Config.Image}} Cmd: {{json .Config.Cmd}}' 2>/dev/null || true
  echo "Process list inside container:"
  docker exec "$CID" ps aux 2>/dev/null | head -6 || echo "(cannot exec)"
  echo "$CID" | xargs -I{} docker exec {} sh -c 'test -f server.js && echo "OK: server.js exists (production)" || echo "WARN: no server.js"' 2>/dev/null || true
else
  echo "No prod frontend container"
fi
echo ""
echo "--- WARNING ---"
echo "If HTML has 'turbopack' but Cmd is node server.js, dev stack overwrote frontend."
echo "Fix: ./scripts/fix-frontend-prod.sh"
echo "NEVER use: docker compose up   (without -f docker-compose.prod.yml)"
echo ""

echo "--- Live site HTML markers ---"
HTML=$(curl -sf --max-time 15 https://vortexm.ru/ 2>/dev/null || curl -sf --max-time 15 http://127.0.0.1/ 2>/dev/null || echo "")
if [[ -z "$HTML" ]]; then
  echo "FAIL: cannot fetch homepage"
else
  echo "$HTML" | grep -q turbopack && echo "FAIL: turbopack = DEV mode (npm run dev), NOT production build!" || echo "OK: no turbopack (production build)"
  echo "$HTML" | grep -q landing-frame && echo "OK: landing-frame in HTML" || echo "FAIL: landing-frame missing — old UI"
  echo "$HTML" | grep -q animated-bg && echo "OK: animated-bg in HTML" || echo "FAIL: animated-bg missing"
  BUILD=$(echo "$HTML" | grep -o 'vortexm-build[^>]*content="[^"]*"' | head -1 || true)
  [[ -n "$BUILD" ]] && echo "Build meta: $BUILD" || echo "WARN: no vortexm-build meta tag"
fi
echo ""
echo "========== done =========="
