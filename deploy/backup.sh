#!/bin/sh
# Nightly PostgreSQL backup (runs in the `backup` container).
#   every day at $BACKUP_AT : pg_dump -> /backups/cellar-YYYY-MM-DD_HHMM.dump
#   keeps the last $BACKUP_KEEP_DAYS days
# Backup right now:  docker compose exec backup sh /backup.sh now
set -eu

dump() {
  f="/backups/cellar-$(date +%F_%H%M).dump"
  if pg_dump --format=custom --no-owner --file="$f.tmp"; then
    mv "$f.tmp" "$f"
    echo "[backup] wrote $f ($(du -h "$f" | cut -f1))"
  else
    rm -f "$f.tmp"
    echo "[backup] FAILED" >&2
    return 1
  fi
  find /backups -name 'cellar-*.dump' -mtime +"$((BACKUP_KEEP_DAYS - 1))" -delete
}

mkdir -p /backups
if [ "${1:-}" = "now" ]; then
  dump
  exit
fi

echo "[backup] daily at $BACKUP_AT ($TZ), keeping $BACKUP_KEEP_DAYS days"
while true; do
  now=$(date +%s)
  next=$(date -d "today $BACKUP_AT" +%s)
  [ "$next" -gt "$now" ] || next=$(date -d "tomorrow $BACKUP_AT" +%s)
  sleep $((next - now))
  dump || true
done
