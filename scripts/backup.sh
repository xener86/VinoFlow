#!/usr/bin/env bash
# Sauvegarde quotidienne de la base VinoFlow (service `backup` de docker-compose).
#
# - pg_dump compressé chaque jour à BACKUP_HOUR (heure locale, cf. TZ)
# - une sauvegarde au démarrage s'il n'y en a pas encore pour aujourd'hui
# - rotation : BACKUP_KEEP_DAILY quotidiennes (défaut 7) dans daily/,
#   BACKUP_KEEP_WEEKLY hebdomadaires (défaut 4) dans weekly/ (copie du dimanche)
#
# `--once` : une sauvegarde immédiate puis sortie, ex.
#   docker compose exec backup bash /usr/local/bin/vinoflow-backup.sh --once
#
# Les dumps sont en SQL texte avec --clean --if-exists : ils se restaurent sur
# une base vide comme sur une base existante (voir README, « Sauvegardes »).
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
BACKUP_HOUR=${BACKUP_HOUR:-3}
KEEP_DAILY=${BACKUP_KEEP_DAILY:-7}
KEEP_WEEKLY=${BACKUP_KEEP_WEEKLY:-4}
export PGHOST=${PGHOST:-db}
export PGUSER=${POSTGRES_USER:-vinoflow}
export PGPASSWORD=${POSTGRES_PASSWORD:?POSTGRES_PASSWORD manquant}
DB=${POSTGRES_DB:-vinoflow}

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

log() { echo "[backup $(date '+%F %T')] $*"; }

# Garde les N fichiers les plus récents d'un dossier.
prune() {
  local dir=$1 keep=$2
  ls -1t "$dir"/*.sql.gz 2>/dev/null | tail -n +"$((keep + 1))" | while read -r f; do
    log "rotation : suppression de $(basename "$f")"
    rm -f -- "$f"
  done
}

run_backup() {
  local name="${DB}-$(date +%Y%m%d-%H%M%S).sql.gz"
  local tmp="$BACKUP_DIR/daily/.${name}.tmp"
  log "dump de la base '$DB'…"
  if pg_dump --clean --if-exists --no-owner "$DB" | gzip -9 > "$tmp"; then
    mv "$tmp" "$BACKUP_DIR/daily/$name"
    log "ok : daily/$name ($(du -h "$BACKUP_DIR/daily/$name" | cut -f1))"
    # Dimanche (date +%u = 7) : copie hebdomadaire.
    if [ "$(date +%u)" = "7" ]; then
      cp "$BACKUP_DIR/daily/$name" "$BACKUP_DIR/weekly/$name"
      log "copie hebdomadaire : weekly/$name"
    fi
    prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
    prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"
  else
    rm -f -- "$tmp"
    log "ÉCHEC du dump"
    return 1
  fi
}

until pg_isready -q -d "$DB"; do
  log "attente de la base…"
  sleep 5
done

if [ "${1:-}" = "--once" ]; then
  run_backup
  exit $?
fi

if ! ls "$BACKUP_DIR/daily/${DB}-$(date +%Y%m%d)-"*.sql.gz >/dev/null 2>&1; then
  run_backup || true
fi

while true; do
  now=$(date +%s)
  next=$(date -d "today ${BACKUP_HOUR}:00" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${BACKUP_HOUR}:00" +%s)
  log "prochaine sauvegarde : $(date -d "@$next" '+%F %T')"
  sleep $((next - now))
  run_backup || true
done
