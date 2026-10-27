#!/usr/bin/env bash
# Reads values from the server's .env (default server/config/.env) the way
# the app's dotenv does, so the guide and deploy/mongo-backup.sh never parse
# it by hand:
#   bash deploy/env-get.sh DB_NAME          prints the value (empty if unset)
#   bash deploy/env-get.sh --mongo-config   prints a mongodump/mongorestore
#                                           config file with MONGO_URI, e.g.
#                                           > /root/atlas-dump.yaml (umask 077)
# Handles "export KEY=", spaces around "=", one pair of matching quotes, and
# a comment after an unquoted value (from the first #, as dotenv does). The
# last assignment wins.
# It can also be sourced: it then only defines env_value and mongo_config.
ENV_FILE="${ENV_FILE:-$(dirname "${BASH_SOURCE[0]}")/../server/config/.env}"

env_value() {
  local line value quote
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*=" "$ENV_FILE" | tail -n 1 || true)"
  [ -n "$line" ] || return 0
  value="${line#*=}"
  value="${value#"${value%%[![:space:]]*}"}"
  quote="${value:0:1}"
  if [ "$quote" = '"' ] || [ "$quote" = "'" ]; then
    value="${value:1}"
    value="${value%%"$quote"*}"
  else
    value="${value%%#*}"
    value="${value%"${value##*[![:space:]]}"}"
  fi
  printf '%s' "$value"
}

# YAML single quotes: the URI is taken literally; a ' inside is doubled.
mongo_config() {
  local uri
  uri="$(env_value MONGO_URI)"
  if [ -z "$uri" ]; then
    echo "MONGO_URI is missing in $ENV_FILE" >&2
    return 1
  fi
  printf "uri: '%s'\n" "${uri//\'/\'\'}"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -euo pipefail
  case "${1:-}" in
    --mongo-config) mongo_config ;;
    "") echo "usage: bash deploy/env-get.sh KEY | --mongo-config" >&2; exit 2 ;;
    *) env_value "$1"; echo ;;
  esac
fi
