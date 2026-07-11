#!/usr/bin/env bash
# Ежедневный бэкап PostgreSQL и MinIO для VortexM.
# Использование: ./scripts/backup.sh
# Cron (каждый день в 03:00): 0 3 * * * /opt/vortexm/scripts/backup.sh >> /var/log/vortexm-backup.log 2>&1

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKUP_DIR="${BACKUP_DIR:-/opt/vortexm/backups}"
DATE="$(date +%Y%m%d_%H%M%S)"
ARCHIVE_DIR="$BACKUP_DIR/$DATE"

mkdir -p "$ARCHIVE_DIR"

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "[$DATE] Backup started"

# Загрузить переменные из .env
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-vortexm}"
POSTGRES_DB="${POSTGRES_DB:-vortexm}"

# 1. Дамп PostgreSQL
echo "Dumping PostgreSQL..."
$COMPOSE exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$ARCHIVE_DIR/postgres.sql.gz"

# 2. Копия volume MinIO через mc (если контейнер minio запущен)
echo "Backing up MinIO bucket..."
$COMPOSE exec -T minio sh -c "
  mc alias set local http://localhost:9000 \"${S3_ACCESS_KEY}\" \"${S3_SECRET_KEY}\" 2>/dev/null || true
  mc mirror local/${S3_BUCKET:-vortexm} /tmp/minio-backup --quiet
" 2>/dev/null || echo "MinIO mirror skipped (mc may not be in minio image)"

# Альтернатива: архив volume через docker run
MINIO_VOLUME="$($COMPOSE ps -q minio 2>/dev/null || true)"
if [[ -n "$MINIO_VOLUME" ]]; then
  docker run --rm \
    -v "vortexm_minio_data:/data:ro" \
    -v "$ARCHIVE_DIR:/backup" \
    alpine tar czf /backup/minio_data.tar.gz -C /data . 2>/dev/null || true
fi

# 3. Копия .env (без публикации в git)
cp .env "$ARCHIVE_DIR/.env.backup" 2>/dev/null || true

# 4. Итоговый архив
tar czf "$BACKUP_DIR/vortexm_backup_${DATE}.tar.gz" -C "$BACKUP_DIR" "$DATE"
rm -rf "$ARCHIVE_DIR"

# Удалить бэкапы старше 14 дней
find "$BACKUP_DIR" -name 'vortexm_backup_*.tar.gz' -mtime +14 -delete

echo "[$DATE] Backup finished: $BACKUP_DIR/vortexm_backup_${DATE}.tar.gz"
