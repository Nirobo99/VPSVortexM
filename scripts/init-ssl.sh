#!/usr/bin/env bash
# Obtain Let's Encrypt certificate and switch nginx to HTTPS config.
# Usage: ./scripts/init-ssl.sh your-domain.ru admin@your-domain.ru

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: $0 <domain> <email>"
  echo "Example: $0 vortexm.example.ru admin@example.ru"
  exit 1
fi

mkdir -p certbot/conf certbot/www

if [[ ! -f .env ]]; then
  echo "Error: .env not found. Copy .env.production.example to .env first."
  exit 1
fi

echo "==> Step 1: HTTP-only nginx (for ACME challenge)"
export NGINX_CONFIG=./nginx/nginx.http-only.conf
docker compose -f docker-compose.prod.yml up -d nginx frontend backend postgres redis

echo "==> Step 2: Request certificate"
docker run --rm \
  -v "$ROOT/certbot/conf:/etc/letsencrypt" \
  -v "$ROOT/certbot/www:/var/www/certbot" \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email

echo "==> Step 3: Prepare HTTPS nginx config"
PROD_CONF="$ROOT/nginx/nginx.prod.conf"
sed "s/YOUR_DOMAIN/$DOMAIN/g" "$PROD_CONF" > "$ROOT/nginx/nginx.prod.active.conf"

echo "==> Step 4: Enable HTTPS nginx"
grep -q '^NGINX_CONFIG=' .env && sed -i "s|^NGINX_CONFIG=.*|NGINX_CONFIG=./nginx/nginx.prod.active.conf|" .env \
  || echo "NGINX_CONFIG=./nginx/nginx.prod.active.conf" >> .env

export NGINX_CONFIG=./nginx/nginx.prod.active.conf
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx

echo ""
echo "SSL ready for https://$DOMAIN"
echo "Set in .env:"
echo "  ALLOWED_ORIGINS=https://$DOMAIN"
echo "  NEXT_PUBLIC_API_URL=https://$DOMAIN/api/v1"
echo "  NEXT_PUBLIC_WS_URL=wss://$DOMAIN/ws"
echo "  NEXT_PUBLIC_LIVEKIT_URL=wss://$DOMAIN/livekit"
echo "  LIVEKIT_URL=wss://$DOMAIN/livekit"
echo "Then rebuild frontend: docker compose -f docker-compose.prod.yml up -d --build frontend"
