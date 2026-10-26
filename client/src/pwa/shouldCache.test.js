import { shouldCache } from "./shouldCache";

describe("shouldCache", () => {
  test.each([
    ["https://x.test/api/lesson", "GET"],
    ["/api/sports/players", "GET"],
  ])("caches %s", (url, method) => expect(shouldCache(url, method)).toBe(true));

  test.each([
    ["/api/attendance/bulk-save", "POST"],
    ["/api/auth/refresh", "GET"],
    ["/api/AUTH/refresh", "GET"],
    ["/api/storage/file/1", "GET"],
    ["/api/sport-portal/photo", "GET"],
    ["/api/sport-portal/request-code", "GET"],
    ["/api/sport-portal/verify", "GET"],
    ["/api/live/stream?ticket=abc", "GET"],
    ["/api/LIVE/stream", "GET"],
    ["/api/locks/student%3A1", "GET"],
    ["/api/LOCKS/student:1", "GET"],
    ["/api/invitetoken/validate", "GET"],
    ["/api/vehicle/12/documents/5/download", "GET"],
    ["/api/storage-backend/file/1", "GET"],
    ["/static/x.js", "GET"],
  ])("does not cache %s %s", (url, method) => expect(shouldCache(url, method)).toBe(false));
});
