// Serves a site build (sport: SPORT_HOST, IT: IT_HOST) from the same server, chosen by host name.
const express = require("express");
const path = require("path");

const API_PATH_RE = /^\/api(\/|$)/;

// The app shell and the service worker are checked again on every load, so a
// deploy reaches the browser at once (without this Chrome may keep showing an
// old build for a while). The hashed files under static/ never change, so the
// browser keeps them for a year and does not ask again.
const ALWAYS_CHECK = new Set(["index.html", "service-worker.js", "manifest.json", "asset-manifest.json"]);
const cacheHeaders = (res, file) => {
  if (ALWAYS_CHECK.has(path.basename(file))) res.set("Cache-Control", "no-cache");
  else if (file.includes(`${path.sep}static${path.sep}`)) res.set("Cache-Control", "public, max-age=31536000, immutable");
};

// req.hostname honours X-Forwarded-Host because the app sets trust proxy.
function isSportHost(req, sportHost) {
  if (!sportHost) return false;
  return String(req.hostname || "").toLowerCase() === String(sportHost).trim().toLowerCase();
}

// Requests for the site's host never reach the system app's index.html: assets come from
// distDir, any other GET that accepts HTML gets the site's shell, and API paths
// and other hosts pass through.
function hostStatic(distDir, host) {
  const serveFiles = express.static(distDir, { setHeaders: cacheHeaders });
  return (req, res, next) => {
    if (!isSportHost(req, host) || API_PATH_RE.test(req.path)) return next();
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    return serveFiles(req, res, (err) => {
      if (err) return next(err);
      if (req.method !== "GET" || !req.accepts("html")) return next();
      res.set("Cache-Control", "no-cache");
      return res.sendFile(path.join(distDir, "index.html"), (sendErr) => {
        // Not built yet (or unreadable): a plain answer, never the error text,
        // which would show the server's file path.
        if (sendErr && !res.headersSent) res.status(503).type("text/plain; charset=utf-8").send("الموقع قيد التحديث، حاول لاحقًا.");
      });
    });
  };
}

// The sport site's name for it.
const sportStatic = hostStatic;

module.exports = { isSportHost, hostStatic, sportStatic, cacheHeaders };
