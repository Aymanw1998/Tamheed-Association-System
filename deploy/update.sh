#!/usr/bin/env bash
# Pull the latest code, install, build the sites and restart the server.
# Run on the server from the project folder:  bash deploy/update.sh
#
# Any failure stops the whole update at once and says where: which server,
# which part, which step, and what state the sites are left in.
set -Eeuo pipefail

cd "$(dirname "$0")/.."

CURRENT_PART="Code"
CURRENT_STEP="Starting"
SITES_STATE="The sites were not changed: the previous version keeps working."
FAILURE_HINT="The output of the failed command is above this message."

# step <part> <what>
step() {
  CURRENT_PART="$1"
  CURRENT_STEP="$2"
  echo "==> [$1] $2"
}

on_failure() {
  local code="$1" line="$2" command="$3"
  trap - ERR
  set +e
  {
    echo
    echo "=================================================="
    echo "!! UPDATE STOPPED: something failed"
    echo "   Server: $(hostname 2>/dev/null || echo unknown)"
    echo "   Part: $CURRENT_PART"
    echo "   Step: $CURRENT_STEP"
    echo "   Command: $command"
    echo "   Exit code: $code (line $line of deploy/update.sh)"
    echo "   State: $SITES_STATE"
    echo "   $FAILURE_HINT"
    echo "=================================================="
  } >&2
  exit "$code"
}
trap 'on_failure "$?" "$LINENO" "$BASH_COMMAND"' ERR

# The app runs as its own limited user (APP_USER, default tamheed), not root
# (owner, 2026-11-16; see deploy/DEPLOY.md). Once that user exists and owns the
# project folder, the whole update runs as it: started by root, it hands
# itself over; started by anyone else, it stops and says how to run it.
# Before the move (no such user, or the folder still root's) nothing changes.
APP_USER="${APP_USER:-tamheed}"
step "Code" "Checking which user runs the update"
ME="$(id -un)"
if [ "$ME" != "$APP_USER" ] && id -u "$APP_USER" >/dev/null 2>&1 \
  && [ "$(stat -c %U .)" = "$APP_USER" ]; then
  if [ "$ME" = "root" ]; then
    echo "==> Running the update as $APP_USER (started by root)"
    # sudo starts from a clean environment: carry the build settings over.
    keep=()
    while IFS= read -r name; do keep+=("$name=${!name}"); done < <(compgen -e | grep -E '^(REACT_APP_|APP_USER$|ALLOW_DAY_UPDATE$)' || true)
    exec sudo -H -u "$APP_USER" env ${keep[@]+"${keep[@]}"} bash deploy/update.sh "$@"
  fi
  FAILURE_HINT="Run it as $APP_USER:  sudo -u $APP_USER bash deploy/update.sh"
  echo "The project belongs to $APP_USER, but the update was started by $ME." >&2
  false
fi
if [ "$ME" = "root" ]; then
  echo "==> Note: running as root. Moving the app to its own user: deploy/DEPLOY.md"
fi

# The server stops for a few seconds while it restarts: only at night, Israel
# time, 20:00-08:00 (owner, 2026-11-16). An urgent fix in the day:
#   ALLOW_DAY_UPDATE=yes bash deploy/update.sh
if [ -z "${TAMHEED_UPDATE_RESTARTED:-}" ] && [ "${ALLOW_DAY_UPDATE:-}" != "yes" ]; then
  step "Code" "Checking the time (updates run 20:00-08:00 Israel time)"
  HOUR="$(TZ=Asia/Jerusalem date +%H)"
  HOUR="$((10#$HOUR))"
  if [ "$HOUR" -ge 8 ] && [ "$HOUR" -lt 20 ]; then
    FAILURE_HINT="Staff are working now. Run it after 20:00, or for an urgent fix: ALLOW_DAY_UPDATE=yes bash deploy/update.sh"
    echo "It is $HOUR:00 in Israel: updates run between 20:00 and 08:00." >&2
    false
  fi
fi

step "Code" "git pull"
git pull --ff-only

# bash keeps running the copy of this script it started with: run the
# version just pulled, so new steps take effect on this same update.
if [ -z "${TAMHEED_UPDATE_RESTARTED:-}" ]; then
  TAMHEED_UPDATE_RESTARTED=1 exec bash deploy/update.sh "$@"
fi

# One maintenance job at a time (Codex full review, 2026-11-18): the nightly
# backup stops the app while it dumps the database, so an update must not
# restart it then, and the backup waits for an update to finish. The lock is
# shared with deploy/mongo-backup.sh and opened read-only, so root (the
# backup's cron) and the app user (the update) can both take it.
MAINT_LOCK="deploy/.maintenance.lock"
[ -e "$MAINT_LOCK" ] || (umask 000; : >> "$MAINT_LOCK")
exec 8<"$MAINT_LOCK"
step "Code" "Waiting for a backup in progress, if any"
if ! flock -w "${MAINT_WAIT_SEC:-1800}" 8; then
  FAILURE_HINT="A backup has been running for 30 minutes. Nothing was changed; try again later."
  false
fi

step "Server" "Installing packages"
# The portrait model runs on the CPU: skip the GPU (CUDA) libraries that
# onnxruntime-node would otherwise download on Linux x64.
ONNXRUNTIME_NODE_INSTALL=skip npm ci --omit=dev --prefix server

step "Server" "Fetching the portrait model for player photos (once, ~26MB)"
node server/scripts/fetchPortraitModel.js

# A build empties its folder before it compiles: built aside, so a failed build
# leaves all the sites as they were. Nothing is swapped until all succeeded.
build_aside() {
  rm -rf "apps/$1/build.new"
  BUILD_PATH=build.new npm run build --prefix "apps/$1"
  test -f "apps/$1/build.new/index.html"
}

swap_in() {
  rm -rf "apps/$1/build.old"
  if [ -d "apps/$1/build" ]; then mv "apps/$1/build" "apps/$1/build.old"; fi
  mv "apps/$1/build.new" "apps/$1/build"
  rm -rf "apps/$1/build.old"
}

step "System" "Installing packages"
npm ci --prefix apps/system
step "System" "Building"
CI=false build_aside system

step "Sport" "Installing packages"
npm ci --prefix apps/sport
step "Sport" "Building"
build_aside sport

step "IT" "Installing packages"
npm ci --prefix apps/it
step "IT" "Building"
build_aside it

step "Nasheed" "Installing packages"
npm ci --prefix apps/nasheed
step "Nasheed" "Building"
build_aside nasheed

SITES_STATE="The swap stopped midway: some sites are on the new version. Check the apps/*/build folders."
step "System" "Moving the new build into place"
swap_in system
step "Sport" "Moving the new build into place"
swap_in sport
step "IT" "Moving the new build into place"
swap_in it
step "Nasheed" "Moving the new build into place"
swap_in nasheed

# The sites' packages are needed only to build them; the next update installs
# them again (npm ci starts from an empty folder anyway). Freeing ~1-1.5GB on a
# small disk. The server's own packages (server/node_modules) stay.
SITES_STATE="The new version of the sites is in place; the server was not restarted yet."
step "Sites" "Removing the build-only packages"
rm -rf apps/system/node_modules apps/sport/node_modules apps/it/node_modules apps/nasheed/node_modules

SITES_STATE="The new version of the sites is already in place, but the server may be down or running the previous code."
FAILURE_HINT="For details: pm2 logs tamheed"
step "Server" "Restarting"
# 8<&-: a pm2 daemon started here must not inherit (and keep) the lock.
if pm2 describe tamheed >/dev/null 2>&1 8<&-; then
  pm2 reload deploy/ecosystem.config.js 8<&-
else
  pm2 start deploy/ecosystem.config.js 8<&-
fi
pm2 save 8<&-

# Settings from the server's own file; a missing one is simply empty.
setting() {
  (grep -E "^$1=" server/config/.env 2>/dev/null || true) | tail -n 1 | cut -d= -f2- | tr -d '\r"'
}
PORT="$(setting PORT)"
PORT="${PORT:-5000}"

# A freshly restarted server needs a moment: asked a few times before giving up.
server_answers() {
  local tries=15
  while [ "$tries" -gt 0 ]; do
    if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/health"; then return 0; fi
    tries=$((tries - 1))
    sleep 2
  done
  return 1
}

step "Server" "Checking the process is running"
sleep 3
pm2 describe tamheed | grep online >/dev/null

step "Server" "Checking the server answers (/api/health)"
server_answers

site_answers() {
  local host="$1"
  if [ -z "$host" ]; then
    curl -fsS -o /dev/null -H "Accept: text/html" "http://127.0.0.1:$PORT/"
  else
    curl -fsS -o /dev/null -H "Accept: text/html" -H "Host: $host" "http://127.0.0.1:$PORT/"
  fi
}

SITES_STATE="The server is up on the new version, but a site is not answering properly."
step "System" "Checking the site answers"
site_answers "$(setting SYSTEM_HOST)"

SPORT_HOST_VALUE="$(setting SPORT_HOST)"
if [ -n "$SPORT_HOST_VALUE" ]; then
  step "Sport" "Checking the site answers"
  site_answers "$SPORT_HOST_VALUE"
fi

IT_HOST_VALUE="$(setting IT_HOST)"
if [ -n "$IT_HOST_VALUE" ]; then
  step "IT" "Checking the site answers"
  site_answers "$IT_HOST_VALUE"
fi

echo "==> Done. Logs: pm2 logs tamheed"
