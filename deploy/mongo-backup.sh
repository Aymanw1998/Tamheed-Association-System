#!/usr/bin/env bash
# Backup of the local MongoDB database (DB_NAME, default tamheed_db), one gzip
# archive per run, keeping the last KEEP_DAYS days. Run on the server, e.g.
# nightly from cron (see deploy/DEPLOY.md, "MongoDB על השרת"):
#   bash /var/www/tamheed/deploy/mongo-backup.sh
#
# - Consistent: when the app (pm2 APP_NAME) is running or about to run it is
#   stopped for the few seconds of the dump and started again whatever
#   happens; an app that was stopped (maintenance) or errored is left as it
#   is. If pm2 or the app cannot be found, or it is in any other state, the
#   backup refuses to run rather than dump during writes; STOP_APP=no dumps
#   without stopping anything. One backup at a time (flock): a second run
#   started meanwhile exits.
# - The connection string comes from server/config/.env (deploy/env-get.sh)
#   in a private config file: the password never shows in the process list,
#   and nothing secret is in this repository.
# - The archive gets its final name only when mongodump succeeded; a failed or
#   interrupted run leaves no file that looks like a backup.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=env-get.sh
source deploy/env-get.sh

BACKUP_DIR="${BACKUP_DIR:-/var/backups/tamheed}"
KEEP_DAYS="${KEEP_DAYS:-14}"
APP_NAME="${APP_NAME:-tamheed}"
STOP_APP="${STOP_APP:-yes}"

db="$(env_value DB_NAME)"
db="${db:-tamheed_db}"

# online | stopped | ... | missing (no pm2, or no app by that name)
app_status() {
  command -v pm2 >/dev/null 2>&1 || { echo missing; return; }
  pm2 jlist 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const app = JSON.parse(s).find((p) => p.name === process.argv[1]);
        console.log(app ? app.pm2_env.status : "missing");
      } catch { console.log("missing"); }
    });' "$APP_NAME"
}

umask 077
mkdir -p "$BACKUP_DIR"

# One run at a time: a second one would see this run's stop and dump while
# this run starts the app again.
exec 9>"$BACKUP_DIR/.backup.lock"
if ! flock -n 9; then
  echo "another backup is running: none made" >&2
  exit 1
fi
stamp="$(date +%F-%H%M%S)"
final="$BACKUP_DIR/tamheed-$stamp.archive.gz"
partial="$BACKUP_DIR/.tamheed-$stamp-$$.partial"
config="$(mktemp)"
stopped=no

cleanup() {
  rm -f "$config" "$partial"
  if [ "$stopped" = yes ]; then
    pm2 start "$APP_NAME" >/dev/null 2>&1 || echo "WARNING: could not start $APP_NAME again: run 'pm2 start $APP_NAME'" >&2
  fi
}
trap cleanup EXIT

mongo_config > "$config"

if [ "$STOP_APP" = yes ]; then
  status="$(app_status)"
  case "$status" in
    online | launching | "waiting restart")
      pm2 stop "$APP_NAME" >/dev/null
      stopped=yes
      ;;
    stopped | errored) ;; # not running (maintenance or a crash): left as it is
    missing)
      echo "pm2 app '$APP_NAME' not found (run as the user that owns pm2, or set APP_NAME / STOP_APP=no): no backup made" >&2
      exit 1
      ;;
    *)
      echo "pm2 app '$APP_NAME' is '$status': no backup made, try again" >&2
      exit 1
      ;;
  esac
fi

mongodump --config="$config" --db="$db" --gzip --archive="$partial" --quiet

if [ "$stopped" = yes ]; then
  pm2 start "$APP_NAME" >/dev/null
  stopped=no
fi

mv "$partial" "$final"
find "$BACKUP_DIR" -maxdepth 1 -name 'tamheed-*.archive.gz' -mtime +"$KEEP_DAYS" -delete

echo "backup ok: $final ($(du -h "$final" | cut -f1))"
