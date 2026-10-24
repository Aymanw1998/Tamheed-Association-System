import { clearApiCache } from "./clearApiCache";

afterEach(() => { delete global.caches; });

test("deletes the tamheed-sport-api cache", async () => {
  const del = jest.fn().mockResolvedValue(true);
  global.caches = { delete: del };
  await clearApiCache();
  expect(del).toHaveBeenCalledWith("tamheed-sport-api");
});

test("never throws when the cache API fails", async () => {
  global.caches = { delete: jest.fn().mockRejectedValue(new Error("x")) };
  await expect(clearApiCache()).resolves.toBeUndefined();
});
