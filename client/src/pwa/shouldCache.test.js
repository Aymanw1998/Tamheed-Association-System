import { shouldCache } from "./shouldCache";

describe("shouldCache", () => {
  test.each([
    ["https://x.test/api/lesson", "GET"],
    ["/api/sports/players", "GET"],
  ])("caches %s", (url, method) => expect(shouldCache(url, method)).toBe(true));

  test.each([
    ["/api/attendance/bulk-save", "POST"],
    ["/api/auth/refresh", "GET"],
    ["/api/storage/file/1", "GET"],
    ["/api/sport-portal/photo", "GET"],
    ["/api/sport-portal/request-code", "GET"],
    ["/api/sport-portal/verify", "GET"],
    ["/static/x.js", "GET"],
  ])("does not cache %s %s", (url, method) => expect(shouldCache(url, method)).toBe(false));
});
