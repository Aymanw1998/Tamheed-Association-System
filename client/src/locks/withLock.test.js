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
