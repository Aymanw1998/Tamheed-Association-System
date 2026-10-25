import {
  enqueue, pending, flush, othersPending, clear, failedItems, retryFailed,
  createMemoryBackend, setBackend, dropKey,
} from "./attendanceQueue";

const item = (queuedAt, extra = {}) => ({
  kind: "general", url: `/attendance/bulk-save?${queuedAt}`, body: { n: queuedAt }, label: "x", queuedAt, ...extra,
});

beforeEach(() => setBackend(createMemoryBackend()));

test("one user never sees another user's items", async () => {
  await enqueue("A", item(1));
  expect(await pending("B")).toEqual([]);
  expect(await pending("A")).toHaveLength(1);
});

test("flush sends in queuedAt order and removes the sent ones", async () => {
  await enqueue("A", item(3));
  await enqueue("A", item(1));
  await enqueue("A", item(2));
  const order = [];
  const res = await flush("A", async (it) => { order.push(it.queuedAt); return { ok: true, status: 200 }; });
  expect(order).toEqual([1, 2, 3]);
  expect(res.sent).toBe(3);
  expect(await pending("A")).toEqual([]);
});

test("401 keeps the item and stops; a later flush empties the queue", async () => {
  await enqueue("A", item(1));
  await enqueue("A", item(2));
  const calls = [];
  const r1 = await flush("A", async (it) => { calls.push(it.queuedAt); return { ok: false, status: 401 }; });
  expect(calls).toEqual([1]);
  expect(r1.sent).toBe(0);
  expect(r1.failed).toEqual([]);
  expect(await pending("A")).toHaveLength(2);
  const r2 = await flush("A", async () => ({ ok: true, status: 200 }));
  expect(r2.sent).toBe(2);
  expect(await pending("A")).toEqual([]);
});

test("no response (status 0) keeps the item and stops", async () => {
  await enqueue("A", item(1));
  await enqueue("A", item(2));
  const calls = [];
  await flush("A", async (it) => { calls.push(it.queuedAt); return { ok: false, status: 0 }; });
  expect(calls).toEqual([1]);
  expect(await pending("A")).toHaveLength(2);
});

test("400 moves the item to failed and continues", async () => {
  await enqueue("A", item(1));
  await enqueue("A", item(2));
  const res = await flush("A", async (it) =>
    it.queuedAt === 1 ? { ok: false, status: 400, message: "bad" } : { ok: true, status: 200 });
  expect(res.sent).toBe(1);
  expect(res.failed).toHaveLength(1);
  expect(res.failed[0].message).toBe("bad");
  expect(res.failed[0].item.queuedAt).toBe(1);
  expect(await failedItems("A")).toHaveLength(1);
  // A failed item is not re-sent until the user retries it.
  const again = jest.fn(async () => ({ ok: true, status: 200 }));
  await flush("A", again);
  expect(again).not.toHaveBeenCalled();
  await retryFailed("A");
  await flush("A", again);
  expect(again).toHaveBeenCalledTimes(1);
  expect(await pending("A")).toEqual([]);
});

test("flush collects overwritten from the responses", async () => {
  await enqueue("A", item(1));
  await enqueue("A", item(2));
  const res = await flush("A", async (it) => ({ ok: true, status: 200, overwritten: it.queuedAt === 1 ? ["s1"] : ["s2", "s1"] }));
  expect(res.overwritten.sort()).toEqual(["s1", "s2"]);
});

test("othersPending counts items of other users", async () => {
  await enqueue("A", item(1));
  await enqueue("A", item(2));
  await enqueue("B", item(3));
  expect(await othersPending("B")).toBe(2);
  expect(await othersPending("A")).toBe(1);
});

test("clear empties only that user's items", async () => {
  await enqueue("A", item(1));
  await enqueue("B", item(2));
  await clear("A");
  expect(await pending("A")).toEqual([]);
  expect(await pending("B")).toHaveLength(1);
});

test("a send that throws keeps the item and stops", async () => {
  await enqueue("A", item(1));
  const res = await flush("A", async () => { throw new Error("boom"); });
  expect(res.sent).toBe(0);
  expect(await pending("A")).toHaveLength(1);
});

test("queuing the same sheet twice keeps only the last", async () => {
  await enqueue("A", item(1, { key: "k1", body: { v: "old" } }));
  await enqueue("A", item(2, { key: "k1", body: { v: "new" } }));
  await enqueue("A", item(3, { key: "k2" }));
  const rows = await pending("A");
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.key === "k1").body.v).toBe("new");
});

test("the same key for another user is untouched", async () => {
  await enqueue("A", item(1, { key: "k1" }));
  await enqueue("B", item(2, { key: "k1" }));
  expect(await pending("A")).toHaveLength(1);
  expect(await pending("B")).toHaveLength(1);
});

test("an online save drops the stale queued item, pending or failed", async () => {
  await enqueue("A", item(1, { key: "k2" }));
  await enqueue("A", item(2, { key: "k1" }));
  await flush("A", async (it) => (it.key === "k2" ? { ok: false, status: 400 } : { ok: false, status: 0 }));
  expect(await failedItems("A")).toHaveLength(1);
  await dropKey("A", "k1");
  await dropKey("A", "k2");
  expect(await pending("A")).toEqual([]);
});

test.each([503, 500, 408, 423, 429])("a %i keeps the item and stops", async (status) => {
  await enqueue("A", item(1));
  await enqueue("A", item(2));
  const send = jest.fn(async () => ({ ok: false, status }));
  const res = await flush("A", send);
  expect(send).toHaveBeenCalledTimes(1);
  expect(res.failed).toEqual([]);
  expect(await pending("A")).toHaveLength(2);
});

test("a failing remove after a successful send does not reject the flush", async () => {
  const mem = createMemoryBackend();
  setBackend({ ...mem, remove: async () => { throw new Error("db"); } });
  await enqueue("A", item(1));
  await expect(flush("A", async () => ({ ok: true, status: 200 }))).resolves.toMatchObject({ sent: 1 });
});
