// Serves the sport site from the same server, chosen by host name (SPORT_HOST).
const express = require("express");
const path = require("path");

const API_PATH_RE = /^\/api(\/|$)/;

// req.hostname honours X-Forwarded-Host because the app sets trust proxy.
function isSportHost(req, sportHost) {
  if (!sportHost) return false;
  return String(req.hostname || "").toLowerCase() === String(sportHost).trim().toLowerCase();
}

// Sport-host requests never reach the system app's index.html: assets come from
// distDir, any other GET that accepts HTML gets the sport shell, and API paths
// and other hosts pass through.
function sportStatic(distDir, sportHost) {
  const serveFiles = express.static(distDir);
  return (req, res, next) => {
    if (!isSportHost(req, sportHost) || API_PATH_RE.test(req.path)) return next();
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    return serveFiles(req, res, (err) => {
      if (err) return next(err);
      if (req.method !== "GET" || !req.accepts("html")) return next();
      return res.sendFile(path.join(distDir, "index.html"), (sendErr) => {
        if (sendErr && !res.headersSent) next(sendErr);
      });
    });
  };
}

module.exports = { isSportHost, sportStatic };
