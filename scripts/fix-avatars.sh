#!/usr/bin/env bash
# One-time fix: MinIO public read + verify avatar URLs (run on server in /opt/vortexm)
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

echo "==> MinIO: public read on bucket"
source .env
docker compose -f docker-compose.prod.yml run --rm minio-init 2>/dev/null || \
  docker run --rm --network vortexm_internal \
    -e S3_ACCESS_KEY="$S3_ACCESS_KEY" \
    -e S3_SECRET_KEY="$S3_SECRET_KEY" \
    -e S3_BUCKET="${S3_BUCKET:-vortexm}" \
    minio/mc:latest /bin/sh -c "
      mc alias set local http://minio:9000 \$S3_ACCESS_KEY \$S3_SECRET_KEY &&
      mc anonymous set download local/\$S3_BUCKET &&
      mc ls local/\$S3_BUCKET/avatars/ 2>/dev/null | head -5 || echo '(no avatars yet)'
    "

echo ""
echo "==> Check .env"
grep -E '^S3_PUBLIC_URL=|^S3_PRIVATE_BUCKET=' .env || true
echo "Required: S3_PUBLIC_URL=https://vortexm.ru/media  S3_PRIVATE_BUCKET=false"

echo ""
echo "==> Test /media/ via nginx"
AVATAR_URL=$(docker compose -f docker-compose.prod.yml exec -T postgres psql -U "${POSTGRES_USER:-vortexm}" -d "${POSTGRES_DB:-vortexm}" -tAc \
  "SELECT avatar_url FROM users WHERE avatar_url IS NOT NULL LIMIT 1;" 2>/dev/null | tr -d ' \n' || true)
if [[ -n "$AVATAR_URL" ]]; then
  echo "curl -sI $AVATAR_URL"
  curl -sI --max-time 10 "$AVATAR_URL" | head -5 || echo "FAIL — check nginx /media/ and S3_PUBLIC_URL"
else
  echo "No avatar in DB yet — upload one after restart"
fi

echo ""
echo "==> Restart backend (applies storage fix)"
"${COMPOSE[@]}" up -d --build backend
echo "Done."
