// Response-time check. Run it ON THE SERVER, from the server folder:
//   node scripts/perfCheck.js [--rounds=3] [--tz=<staff ID number>]
//        [--local=http://127.0.0.1:5000] [--public=https://system.example.org]
//        [--sport=https://sport.example.org] [--student=<sport player studentId>]
//
// It measures, read-only:
//   1. server -> database: a ping, and the reads the code really makes
//      (the user lookup every request does, and the full lists).
//   2. client -> server: each staff and sport GET, straight to the app
//      (--local) and through nginx + HTTPS (--public / --sport), split into
//      DNS, connect, TLS, server wait and download.
// For the signed-in calls it signs a 5-minute token for one staff user
// (default SYSTEM_ADMIN_TZ) and one player session (the first sport player),
// with the secrets in config/.env. No token is printed and nothing is written.
// Not covered: the user's own network, and the time the browser takes to draw
// the screen after the answer arrives.
const path = require("path");
const http = require("http");
const https = require("https");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "config", ".env") });

const { performance } = require("perf_hooks");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));
const ROUNDS = Math.max(1, Number(args.rounds) || 3);
const LOCAL = args.local || `http://127.0.0.1:${process.env.PORT || 5000}`;
const PUBLIC = args.public || process.env.CLIENT_URL || "";
const SPORT = args.sport || (process.env.SPORT_HOST ? `https://${process.env.SPORT_HOST}` : "");
const STAFF_TZ = args.tz || process.env.SYSTEM_ADMIN_TZ || "";

// The staff reads a screen makes when it opens (all read-only).
const STAFF_CALLS = [
  ["students list", "/api/student"],
  ["lessons list", "/api/lesson"],
  ["lessons today", "/api/lesson/today"],
  ["sport schedule", "/api/lesson/sport-schedule"],
  ["reports list", "/api/report"],
  ["users list", "/api/user"],
  ["vehicles list", "/api/vehicle"],
  ["notices unread", "/api/notices/unread-count"],
];
// These create the football sport when it does not exist yet (ensureFootball),
// so they are measured only when it already exists (see main).
const SPORT_STAFF_CALLS = [
  ["sport players", "/api/sports/players"],
  ["sport lessons", "/api/sports/lessons"],
];

/* ---------------- numbers ---------------- */

const round1 = (n) => Math.round(n * 10) / 10;
function stats(values) {
  const list = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const pick = (q) => list[Math.min(list.length - 1, Math.floor(q * list.length))];
  return {
    min: list[0],
    avg: list.reduce((sum, v) => sum + v, 0) / list.length,
    median: pick(0.5),
    p95: pick(0.95),
    max: list[list.length - 1],
  };
}
const ms = (n) => (Number.isFinite(n) ? `${round1(n)}`.padStart(7) : "      -");
const pad = (text, width) => String(text).slice(0, width).padEnd(width);
const HEADER = `${pad("", 30)}${"min".padStart(7)}${"avg".padStart(7)}${"median".padStart(7)}${"p95".padStart(7)}${"max".padStart(7)}   ms`;
const line = (label, s, note = "") => console.log(`${pad(label, 30)}${s ? [s.min, s.avg, s.median, s.p95, s.max].map(ms).join("") : "   no answer"}${note ? `   ${note}` : ""}`);

/* ---------------- HTTP with phases ---------------- */

// One GET on a fresh connection (as a first visit). Times in ms from the start:
// dns, connect, tls (0 when not used), wait (request sent -> first byte of the
// answer: the server's own time), download, total.
function timedGet(url, headers = {}) {
  return new Promise((resolve) => {
    const target = new URL(url);
    const lib = target.protocol === "https:" ? https : http;
    const t0 = process.hrtime.bigint();
    const since = () => Number(process.hrtime.bigint() - t0) / 1e6;
    const marks = {};
    const req = lib.request(target, { method: "GET", headers, agent: false, timeout: 30000 }, (res) => {
      marks.firstByte = since();
      let bytes = 0;
      res.on("data", (chunk) => { bytes += chunk.length; });
      res.on("end", () => {
        const end = since();
        const ready = marks.tls ?? marks.connect ?? 0;
        resolve({
          status: res.statusCode,
          bytes,
          dns: marks.lookup ?? 0,
          connect: (marks.connect ?? 0) - (marks.lookup ?? 0),
          tls: marks.tls ? marks.tls - marks.connect : 0,
          wait: marks.firstByte - ready,
          download: end - marks.firstByte,
          total: end,
        });
      });
    });
    req.on("socket", (socket) => {
      socket.on("lookup", () => { marks.lookup = since(); });
      socket.on("connect", () => { marks.connect = since(); });
      socket.on("secureConnect", () => { marks.tls = since(); });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ status: 0, error: error.message }));
    req.end();
  });
}

// ROUNDS answered calls after one warm-up call that is not counted.
async function measure(url, headers) {
  await timedGet(url, headers);
  const runs = [];
  for (let i = 0; i < ROUNDS; i += 1) runs.push(await timedGet(url, headers));
  return runs;
}

/* ---------------- sessions (never printed) ---------------- */

async function staffHeaders() {
  const { UserModelDef } = require("../Entities/User/User.model");
  if (!STAFF_TZ || !process.env.JWT_ACCESS_SECRET) return null;
  const user = (await UserModelDef.get({ tz: STAFF_TZ }, "active"))?.result?.[0];
  if (!user) return null;
  const token = jwt.sign(
    { id: String(user._id), tz: user.tz, roles: user.roles || [], room: "active" },
    process.env.JWT_ACCESS_SECRET,
    { algorithm: "HS256", expiresIn: 300 },
  );
  return { Authorization: `Bearer ${token}` };
}

async function sportHeaders() {
  const { SportPlayerModelDef } = require("../Entities/Sport/SportPlayer.model");
  const { COOKIE_NAME } = require("../Entities/SportPortal/SportPortal.auth");
  if (!process.env.SPORT_SESSION_SECRET) return null;
  const studentId = args.student || (await SportPlayerModelDef.get({}))?.result?.[0]?.studentId;
  if (!studentId) return null;
  const token = jwt.sign({ sub: String(studentId), typ: "sport-student" }, process.env.SPORT_SESSION_SECRET, { algorithm: "HS256", expiresIn: 300 });
  return { Cookie: `${COOKIE_NAME}=${token}` };
}

/* ---------------- the check ---------------- */

async function databaseSection() {
  console.log("\n== 1. Server -> database (MongoDB) ==");
  console.log(HEADER);
  const pings = [];
  for (let i = 0; i < ROUNDS + 2; i += 1) {
    const t = performance.now();
    await mongoose.connection.db.admin().ping();
    pings.push(performance.now() - t);
  }
  const ping = stats(pings);
  line("ping (one round trip)", ping);

  const { UserModelDef } = require("../Entities/User/User.model");
  const { StudentModelDef } = require("../Entities/Student/Student.model");
  const { LessonModelDef } = require("../Entities/Lesson/Lesson.model");
  const { ReportModelDef } = require("../Entities/Report/Report.model");
  const reads = [
    ["user lookup (every request)", () => UserModelDef.get({ tz: STAFF_TZ || "-" }, "active")],
    ["all active users", () => UserModelDef.get({}, "active")],
    ["all students", () => StudentModelDef.get({})],
    ["all lessons", () => LessonModelDef.get({})],
    ["all reports", () => ReportModelDef.get({})],
  ];
  for (const [label, read] of reads) {
    const times = [];
    let rows = 0;
    for (let i = 0; i < ROUNDS; i += 1) {
      const t = performance.now();
      rows = (await read())?.result?.length ?? 0;
      times.push(performance.now() - t);
    }
    line(label, stats(times), `${rows} rows`);
  }
  return ping;
}

async function httpSection(title, base, calls, headers) {
  console.log(`\n== ${title}: ${base} ==`);
  console.log(`${HEADER}   (wait = the server's own time)`);
  const results = [];
  for (const [label, route, needsLogin] of calls) {
    if (needsLogin && !headers) {
      console.log(`${pad(label, 30)}   skipped: no session (check --tz / --student and the secrets in .env)`);
      continue;
    }
    const runs = await measure(`${base}${route}`, needsLogin ? headers : {});
    const ok = runs.filter((r) => r.status > 0);
    // Only answered calls count in the summary (a 403 or 500 is not a real answer).
    const answered = ok.length > 0 && ok.every((r) => r.status >= 200 && r.status < 400);
    const statuses = [...new Set(runs.map((r) => r.status || r.error))].join(",");
    const total = stats(ok.map((r) => r.total));
    const wait = stats(ok.map((r) => r.wait));
    const kb = ok.length ? `${round1((ok[0].bytes || 0) / 1024)} KB` : "";
    line(label, total, `status ${statuses}  ${kb}${answered ? "" : "  (not counted)"}`);
    if (ok.length) {
      const phase = (key) => round1(stats(ok.map((r) => r[key])).median);
      console.log(`${pad("", 30)}   dns ${phase("dns")}  connect ${phase("connect")}  tls ${phase("tls")}  wait ${phase("wait")}  download ${phase("download")}`);
    }
    results.push({ label, route, total, wait, api: answered && route.startsWith("/api/") && route !== "/api/health" });
  }
  return results;
}

function summary(name, results, healthWait, ping) {
  const api = results.filter((r) => r.api && r.total);
  if (!api.length) return;
  const slowest = api.reduce((a, b) => (b.total.max > a.total.max ? b : a));
  const fastest = api.reduce((a, b) => (b.total.min < a.total.min ? b : a));
  console.log(`\n-- ${name} --`);
  console.log(`  average answer: ${round1(api.reduce((s, r) => s + r.total.avg, 0) / api.length)} ms`);
  console.log(`  fastest: ${round1(fastest.total.min)} ms (${fastest.label}); slowest: ${round1(slowest.total.max)} ms (${slowest.label})`);
  // The estimate only means something when a round trip is long enough to measure.
  if (ping && healthWait && ping.median >= 5) {
    for (const r of api) {
      const trips = (r.wait.median - healthWait) / ping.median;
      if (trips > 0.5) console.log(`  ${pad(r.label, 22)} ~${Math.round(trips)} database round trips (${round1(r.wait.median)} ms waiting)`);
    }
  }
}

async function main() {
  console.log(`Tamheed response-time check: ${ROUNDS} rounds per call (+1 warm-up), ${new Date().toISOString()}`);
  const connectDB = require("../config/db");
  await connectDB();

  const ping = await databaseSection();
  const staff = await staffHeaders();
  const sport = await sportHeaders();
  if (!staff) console.log(`\n(no staff session: user ${STAFF_TZ ? "not found in the active room" : "not given, use --tz="})`);
  if (!sport) console.log("(no sport session: no player found, or SPORT_SESSION_SECRET is missing)");

  // Football is created on first use: without it, the sport calls would write.
  const { SportModelDef } = require("../Entities/Sport/Sport.model");
  const footballExists = ((await SportModelDef.get({ name: "كرة القدم" }))?.result || []).length > 0;
  if (!footballExists) console.log("(sport calls skipped: the football sport does not exist yet, and they would create it)");
  const staffCalls = [["health (no login, no DB)", "/api/health", false], ...[...STAFF_CALLS, ...(footballExists ? SPORT_STAFF_CALLS : [])].map(([l, r]) => [l, r, true])];
  const sportCalls = footballExists ? [["player card (/me)", "/api/sport-portal/me", true]] : [];

  const local = await httpSection("2. App directly (no nginx, no HTTPS)", LOCAL, staffCalls, staff);
  // The sport call goes with the player's session, not the staff one.
  const localSport = await httpSection("2b. App directly, sport site", LOCAL, sportCalls, sport);
  const localHealth = local.find((r) => r.route === "/api/health")?.wait?.median;

  let pub = [];
  let pubSport = [];
  if (PUBLIC) {
    pub = await httpSection("3. Through nginx + HTTPS (system)", PUBLIC.replace(/\/$/, ""), [["system page (index.html)", "/", false], ...staffCalls], staff);
  } else {
    console.log("\n(skipped the public address: give --public=https://... or set CLIENT_URL)");
  }
  if (SPORT) {
    pubSport = await httpSection("4. Through nginx + HTTPS (sport site)", SPORT.replace(/\/$/, ""), [["sport page (index.html)", "/", false], ...sportCalls], sport);
  }

  console.log("\n================ SUMMARY ================");
  if (ping) console.log(`  one database round trip: ~${round1(ping.median)} ms (under 10 ms is normal when the database is near the server)`);
  if (localHealth !== undefined) console.log(`  server alone (no database): ~${round1(localHealth)} ms`);
  summary("App directly (server + database)", [...local, ...localSport], localHealth, ping);
  summary("Public address (adds nginx + HTTPS)", [...pub, ...pubSport], localHealth, ping);
  const pairs = pub.filter((r) => r.api && r.total).map((r) => [r, local.find((l) => l.route === r.route)]).filter(([, l]) => l?.total);
  if (pairs.length) {
    const extra = pairs.reduce((s, [p, l]) => s + (p.total.median - l.total.median), 0) / pairs.length;
    console.log(`\n  nginx + HTTPS add ~${round1(extra)} ms per call (a new connection each time)`);
  }
  console.log("\n  Not measured here: the user's own internet, and the browser drawing the screen.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("perfCheck failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
