#!/usr/bin/env bash
# Pull the latest code, install, build the web app and restart the server.
# Run on the server from the project folder:  bash deploy/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling the latest code"
git pull --ff-only

echo "==> Installing server packages"
npm ci --omit=dev --prefix server

echo "==> Installing and building the web app"
npm ci --prefix client
CI=false npm run build --prefix client

echo "==> Installing and building the sport site"
npm ci --prefix sport
npm run build --prefix sport

echo "==> Restarting the server"
if pm2 describe tamheed >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.js
else
  pm2 start deploy/ecosystem.config.js
fi
pm2 save

echo "==> Done. Logs: pm2 logs tamheed"
