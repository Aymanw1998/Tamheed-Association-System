import { shouldCache } from "./shouldCache";

describe("shouldCache", () => {
  test.each([
    ["https://x.test/api/sport-portal/me", "GET"],
    ["/api/sport-portal/me", "get"],
    ["/API/sport-portal/ME", "GET"],
  ])("caches %s", (url, method) => expect(shouldCache(url, method)).toBe(true));

  test.each([
    ["/api/sport-portal/photo", "GET"],
    ["/api/sport-portal/Photo", "GET"],
    ["/api/sport-portal/verify", "GET"],
    ["/api/sport-portal/request-code", "GET"],
    ["/api/sport-portal/me", "POST"],
    ["/api/sport-portal/logout", "POST"],
    ["/api/auth/refresh", "GET"],
    ["/static/x.js", "GET"],
  ])("does not cache %s %s", (url, method) => expect(shouldCache(url, method)).toBe(false));
});
