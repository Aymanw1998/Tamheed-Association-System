const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const zlib = require("node:zlib");
const express = require("express");
const { compress } = require("../utils/compress");
const { cacheHeaders } = require("../utils/sportHost");

function get(port, url, extra = {}) {
  return new Promise((resolve, reject) => {
    http.get({ port, path: url, headers: { "Accept-Encoding": "gzip", ...extra } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
    }).on("error", reject);
  });
}

test("scripts and API answers are compressed; streams are not; hashed files are kept for a year", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "static", "js"), { recursive: true });
  const script = "const value = 1;\n".repeat(5000);
  fs.writeFileSync(path.join(dir, "static", "js", "main.abc.js"), script);
  fs.writeFileSync(path.join(dir, "index.html"), "<html></html>");

  const app = express();
  app.use(compress());
  app.get("/api/live/stream", (req, res) => {
    res.set("Content-Type", "text/event-stream");
    res.end("data: x\n\n".repeat(1000));
  });
  app.get("/api/list", (req, res) => res.json({ rows: "x".repeat(10000) }));
  app.use(express.static(dir, { setHeaders: cacheHeaders }));
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();

  const js = await get(port, "/static/js/main.abc.js");
  assert.equal(js.headers["content-encoding"], "gzip");
  assert.equal(zlib.gunzipSync(js.body).toString(), script);
  assert.match(js.headers["cache-control"], /max-age=31536000, immutable/);

  const part = await get(port, "/static/js/main.abc.js", { Range: "bytes=0-9" });
  assert.equal(part.headers["content-encoding"], undefined);
  assert.equal(part.body.length, 10);

  assert.equal((await get(port, "/api/list")).headers["content-encoding"], "gzip");
  assert.equal((await get(port, "/api/live/stream")).headers["content-encoding"], undefined);
  assert.equal((await get(port, "/index.html")).headers["cache-control"], "no-cache");
});
