#!/usr/bin/env bash
# Pull the latest code, install, build the web app and restart the server.
# Run on the server from the project folder:  bash deploy/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling the latest code"
git pull --ff-only

echo "==> Installing server packages"
# The portrait model runs on the CPU: skip the GPU (CUDA) libraries that
# onnxruntime-node would otherwise download on Linux x64.
ONNXRUNTIME_NODE_INSTALL=skip npm ci --omit=dev --prefix server

echo "==> Fetching the portrait model for player photos (once, ~26MB)"
# Without the model the site still works and shows the plain photos, so a
# failed download (or checksum) does not stop the update.
node server/scripts/fetchPortraitModel.js || echo "!! Portrait model not fetched: player photos stay plain. Run it again later."

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
