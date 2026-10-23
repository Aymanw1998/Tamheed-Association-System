// pm2 process file for the production server (see deploy/DEPLOY.md).
//   pm2 start deploy/ecosystem.config.js
//   pm2 save
// The server reads its settings from server/config/.env; nothing secret here.
const path = require("path");

module.exports = {
  apps: [
    {
      name: "tamheed",
      cwd: path.join(__dirname, "..", "server"),
      script: "server.js",
      // One process: the live channel and the in-memory rate limits assume a
      // single instance.
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "700M",
      time: true,
    },
  ],
};
