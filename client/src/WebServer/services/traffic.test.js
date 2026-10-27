import { createTraffic, LONG_MS, SHORT_MS } from "./traffic";

// A fake network: each call waits until release() and records what was sent.
function fakeNetwork() {
  const sent = [];
  const pending = [];
  const network = (config) => new Promise((resolve, reject) => {
    sent.push(`${String(config.method || "get").toUpperCase()} ${config.url}`);
    pending.push({ config, resolve, reject });
  });
  const answer = (i, data = { ok: true }, status = 200) => pending[i].resolve({ data, status, headers: {}, config: pending[i].config });
  const fail = (i, error) => pending[i].reject(error);
  return { network, sent, pending, answer, fail };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const get = (url, extra = {}) => ({ method: "get", url, headers: { Authorization: "Bearer A" }, ...extra });

test("the same read asked together is sent once; each caller gets its own copy", async () => {
  const net = fakeNetwork();
  const send = createTraffic().wrap(net.network);
  const a = send(get("/student"));
  const b = send(get("/student"));
  await tick();
  expect(net.sent).toEqual(["GET /student"]);
  net.answer(0, { ok: true, students: [{ tz: "1" }] });
  const [ra, rb] = await Promise.all([a, b]);
  ra.data.students.push({ tz: "x" });
  expect(rb.data.students).toEqual([{ tz: "1" }]);
});

test("a read answered a moment ago comes from memory; after SHORT_MS it is sent again", async () => {
  let now = 0;
  const net = fakeNetwork();
  const send = createTraffic({ now: () => now }).wrap(net.network);
  const first = send(get("/lesson"));
  await tick();
  net.answer(0, { ok: true, lessons: [] });
  await first;
  now += SHORT_MS - 1;
  await send(get("/lesson"));
  expect(net.sent).toHaveLength(1);
  now += 2;
  send(get("/lesson"));
  await tick();
  expect(net.sent).toHaveLength(2);
});

test("session-wide reads (auth/me as a POST, my permissions) are kept for LONG_MS", async () => {
  let now = 0;
  const net = fakeNetwork();
  const send = createTraffic({ now: () => now }).wrap(net.network);
  const me = send({ method: "post", url: "/auth/me", headers: {} });
  await tick();
  net.answer(0, { user: { tz: "1" } });
  await me;
  now += LONG_MS - 1;
  await send({ method: "post", url: "/auth/me", headers: {} });
  expect(net.sent).toEqual(["POST /auth/me"]);
});

test("any write empties the memory; a read on its way during a write is not kept", async () => {
  const net = fakeNetwork();
  const send = createTraffic().wrap(net.network);
  const r1 = send(get("/student"));
  await tick();
  net.answer(0);
  await r1;
  const write = send({ method: "put", url: "/student/1", headers: {} });
  await tick();
  net.answer(1);
  await write;
  const r2 = send(get("/student"));
  await tick();
  expect(net.sent).toEqual(["GET /student", "PUT /student/1", "GET /student"]);
  net.answer(2);
  await r2;
});

test("another token never reuses what was kept for the previous one", async () => {
  const net = fakeNetwork();
  const send = createTraffic().wrap(net.network);
  const r1 = send(get("/student", { headers: { Authorization: "Bearer A" } }));
  await tick();
  net.answer(0);
  await r1;
  send(get("/student", { headers: { Authorization: "Bearer B" } }));
  await tick();
  expect(net.sent).toHaveLength(2);
});

test("at most 4 on the network; screen reads go before background reads", async () => {
  const net = fakeNetwork();
  const send = createTraffic().wrap(net.network);
  send(get("/notices/unread-count"));
  send(get("/vehicle/alerts"));
  ["/student", "/lesson", "/report", "/user", "/vehicle"].forEach((u) => send(get(u)));
  await tick();
  expect(net.sent).toEqual(["GET /notices/unread-count", "GET /vehicle/alerts", "GET /student", "GET /lesson"]);
  net.answer(0);
  await tick();
  expect(net.sent[4]).toBe("GET /report"); // a screen read, not the queued background one
});

test("locks, the live channel, refresh and file downloads are never kept", async () => {
  const net = fakeNetwork();
  const send = createTraffic().wrap(net.network);
  for (const url of ["/locks/student:1", "/storage/download", "/auth/refresh"]) {
    const first = send(get(url));
    await tick();
    net.answer(net.pending.length - 1);
    await first;
    send(get(url));
    await tick();
  }
  expect(net.sent).toHaveLength(6);
});

test("a shared read that fails gives each caller its own error with its own request", async () => {
  const net = fakeNetwork();
  const send = createTraffic().wrap(net.network);
  const c1 = get("/student");
  const c2 = get("/student");
  const a = send(c1);
  const b = send(c2);
  await tick();
  const error = Object.assign(new Error("expired"), { response: { status: 401 }, config: c1 });
  net.fail(0, error);
  const [ea, eb] = await Promise.all([a.catch((e) => e), b.catch((e) => e)]);
  expect(ea.config).toBe(c1);
  expect(eb.config).toBe(c2);
  expect(eb.response.status).toBe(401);
  // Nothing was kept: the next read goes to the network.
  send(get("/student"));
  await tick();
  expect(net.sent).toHaveLength(2);
});

test("a read that ran while a write was on its way is not kept after the write ends", async () => {
  const net = fakeNetwork();
  const send = createTraffic().wrap(net.network);
  const write = send({ method: "post", url: "/notices/read-all", headers: {} });
  await tick();
  const read = send(get("/notices/unread-count"));
  await tick();
  net.answer(1, { ok: true, count: 5 }); // the read finishes first, with the old count
  await read;
  net.answer(0);
  await write;
  send(get("/notices/unread-count"));
  await tick();
  expect(net.sent).toEqual(["POST /notices/read-all", "GET /notices/unread-count", "GET /notices/unread-count"]);
});

test("a failed write empties the memory too", async () => {
  const net = fakeNetwork();
  const send = createTraffic().wrap(net.network);
  const r1 = send(get("/student"));
  await tick();
  net.answer(0);
  await r1;
  const write = send({ method: "delete", url: "/student/1", headers: {} });
  await tick();
  net.fail(1, new Error("500"));
  await write.catch(() => {});
  send(get("/student"));
  await tick();
  expect(net.sent).toHaveLength(3);
});

test("the assistant's reads are never kept (its chat is written outside this layer)", async () => {
  const net = fakeNetwork();
  const send = createTraffic().wrap(net.network);
  const first = send(get("/ai/conversations/c1"));
  await tick();
  net.answer(0);
  await first;
  send(get("/ai/conversations/c1"));
  await tick();
  expect(net.sent).toHaveLength(2);
});
