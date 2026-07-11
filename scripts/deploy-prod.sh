#!/usr/bin/env bash
# Full production deploy / update on the server.
# Usage: ./scripts/deploy-prod.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Error: .env not found."
  echo "  cp .env.production.example .env"
  echo "  nano .env   # fill all REPLACE_* values"
  exit 1
fi

mkdir -p certbot/conf certbot/www

echo "==> Building and starting production stack"
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

echo "==> Service status"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "Deploy finished."
echo "Logs: docker compose -f docker-compose.prod.yml logs -f --tail=100"
echo "If HTTPS is not configured yet: ./scripts/init-ssl.sh YOUR_DOMAIN admin@YOUR_DOMAIN"
