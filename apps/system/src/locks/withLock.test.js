jest.mock("../WebServer/services/api", () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock("../journey/demoMode", () => ({ __esModule: true, isDemo: jest.fn(() => false) }));

import api from "../WebServer/services/api";
import withLock from "./withLock";

const released = () => api.post.mock.calls.filter((c) => c[0] === "/locks/release");

beforeEach(() => api.post.mockReset());

test("releases a lock the one-shot acquire created", async () => {
  api.post.mockResolvedValue({ data: { ok: true, created: true } });
  await expect(withLock("player:1", async () => "done")).resolves.toBe("done");
  expect(released()).toHaveLength(1);
});

test("keeps a lock this tab already held before the one-shot", async () => {
  api.post.mockResolvedValue({ data: { ok: true, created: false } });
  await withLock("player:1", async () => "done");
  expect(released()).toHaveLength(0);
});

test("finishes only after the release is done, so a following write never loses its lock", async () => {
  let release;
  api.post.mockImplementation((path) => (path === "/locks/release"
    ? new Promise((r) => { release = r; })
    : Promise.resolve({ data: { ok: true, created: true } })));
  let finished = false;
  const done = withLock("lesson:L1", async () => "x").then(() => { finished = true; });
  await new Promise((r) => setTimeout(r, 0));
  expect(finished).toBe(false);
  release({ data: { ok: true } });
  await done;
  expect(finished).toBe(true);
});

test("a failed release does not fail the write", async () => {
  api.post.mockImplementation((path) => (path === "/locks/release"
    ? Promise.reject(new Error("offline"))
    : Promise.resolve({ data: { ok: true, created: true } })));
  await expect(withLock("lesson:L1", async () => "x")).resolves.toBe("x");
});
