const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const express = require("express");
const { isSportHost, sportStatic } = require("../utils/sportHost");

const SPORT = "sport.tamheed-ramla.org";

const fakeReq = (hostname, extra = {}) => ({
  hostname,
  method: "GET",
  path: "/",
  url: "/",
  headers: {},
  accepts: () => "html",
  ...extra,
});

test("isSportHost matches the host case-insensitively", () => {
  assert.equal(isSportHost(fakeReq("Sport.Tamheed-Ramla.org"), SPORT), true);
});

test("isSportHost rejects the system host", () => {
  assert.equal(isSportHost(fakeReq("system.tamheed-ramla.org"), SPORT), false);
});

test("isSportHost rejects every host when SPORT_HOST is empty", () => {
  assert.equal(isSportHost(fakeReq(SPORT), ""), false);
  assert.equal(isSportHost(fakeReq(SPORT), undefined), false);
});

test("sportStatic calls next() for an API path on the sport host", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sport-host-"));
  try {
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html>");
    const mw = sportStatic(dir, SPORT);
    let called = false;
    const req = fakeReq(SPORT, { path: "/api/sport-portal/me", url: "/api/sport-portal/me" });
    mw(req, {}, () => { called = true; });
    assert.equal(called, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sportStatic serves the sport app by host and passes other hosts on", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sport-host-"));
  const app = express();
  app.set("trust proxy", 1);
  app.use(sportStatic(dir, SPORT));
  app.use((req, res) => res.status(418).send("system app"));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><p>sport shell</p>");
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "assets", "app.js"), "console.log('sport');");

    const sportHeaders = { "X-Forwarded-Host": SPORT, Accept: "text/html" };

    const shell = await fetch(`${base}/students/card/12`, { headers: sportHeaders });
    assert.equal(shell.status, 200);
    assert.match(await shell.text(), /sport shell/);
    assert.equal(shell.headers.get("x-content-type-options"), "nosniff");
    assert.equal(shell.headers.get("x-frame-options"), "DENY");

    const asset = await fetch(`${base}/assets/app.js`, { headers: sportHeaders });
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /sport/);
    assert.equal(asset.headers.get("x-content-type-options"), "nosniff");
    assert.equal(asset.headers.get("x-frame-options"), "DENY");

    const other = await fetch(`${base}/students/card/12`, {
      headers: { "X-Forwarded-Host": "system.tamheed-ramla.org", Accept: "text/html" },
    });
    assert.equal(other.status, 418);

    // Not built yet: a plain 503, never the error text with the server's file path.
    fs.rmSync(path.join(dir, "index.html"));
    const missing = await fetch(`${base}/`, { headers: sportHeaders });
    assert.equal(missing.status, 503);
    assert.doesNotMatch(await missing.text(), /index\.html|ENOENT/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
