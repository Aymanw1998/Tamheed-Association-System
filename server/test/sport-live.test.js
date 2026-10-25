// GET /api/sport-portal/live: SSE for the signed-in student. No cookie -> 401;
// with the cookie a hub toStudents(["s1"]) writes `event: me` to that student only.
const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const cookieParser = require("cookie-parser");

const { createSportAuth } = require("../Entities/SportPortal/SportPortal.auth");
const { createSportLive } = require("../Entities/SportPortal/SportPortal.live");
const { createLiveHub } = require("../services/liveHub");

const jwt = require("jsonwebtoken");

async function start() {
  process.env.SPORT_SESSION_SECRET = "test-secret-for-live";
  const hub = createLiveHub();
  const players = { get: async () => ({ success: true, result: [{ _id: "pl" }] }) };
  const students = {
    get: async (q) => ({ success: true, result: [{ _id: q._id }] }),
  };
  const auth = createSportAuth({ students, players, ensureSport: async () => ({ _id: "sp" }), log() {} });
  const app = express();
  app.use(cookieParser());
  app.get("/api/sport-portal/live", auth.requireSportStudent, createSportLive({ hub, pingMs: 50 }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cookie = (id) => `tamheed_sport=${jwt.sign({ sub: id, typ: "sport-student" }, process.env.SPORT_SESSION_SECRET)}`;
  return { hub, server, port: server.address().port, cookie };
}

function open(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/sport-portal/live", headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; });
      resolve({ res, req, text: () => body });
    });
    req.on("error", reject);
  });
}

const until = async (fn) => { for (let i = 0; i < 100 && !fn(); i += 1) await new Promise((r) => setTimeout(r, 20)); };

test("without the sport cookie the stream answers 401", async () => {
  const { server, port } = await start();
  try {
    const { res, req } = await open(port);
    assert.equal(res.statusCode, 401);
    req.destroy();
  } finally { server.closeAllConnections?.(); server.close(); }
});

test("toStudents writes `event: me` to that student only, and pings", async () => {
  const { hub, server, port, cookie } = await start();
  try {
    const mine = await open(port, { Cookie: cookie("s1") });
    const other = await open(port, { Cookie: cookie("s2") });
    assert.equal(mine.res.statusCode, 200);
    assert.match(mine.res.headers["content-type"], /text\/event-stream/);
    await until(() => mine.text().includes("retry:") && other.text().includes("retry:"));
    hub.toStudents(["s1"], "me");
    await until(() => mine.text().includes("event: me"));
    assert.match(mine.text(), /event: me\ndata: \{\}\n\n/);
    assert.ok(!other.text().includes("event: me"));
    await until(() => mine.text().includes(": ping"));
    assert.match(mine.text(), /: ping/);
    mine.req.destroy();
    other.req.destroy();
    // A closed stream is unsubscribed: delivering again does not throw.
    await new Promise((r) => setTimeout(r, 50));
    hub.toStudents(["s1"], "me");
  } finally { server.closeAllConnections?.(); server.close(); }
});
