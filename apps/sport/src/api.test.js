import { shapeResult, TOO_MANY_MESSAGE, GENERIC_ERROR_MESSAGE, photoUrl } from "./api.js";

describe("shapeResult", () => {
  it("replaces the English 429 message with Arabic", () => {
    const r = shapeResult(429, { ok: false, message: "Too many requests" });
    expect(r.ok).toBe(false);
    expect(r.data.message).toBe(TOO_MANY_MESSAGE);
  });
  it("replaces 500, 401 and network failures with the fixed Arabic error", () => {
    for (const status of [500, 401, 0]) {
      expect(shapeResult(status, { message: "Internal Server Error" }).data.message).toBe(GENERIC_ERROR_MESSAGE);
    }
  });
  it("keeps the server message for 400", () => {
    const r = shapeResult(400, { ok: false, message: "الرمز غير صحيح أو انتهت صلاحيته" });
    expect(r.ok).toBe(false);
    expect(r.data.message).toBe("الرمز غير صحيح أو انتهت صلاحيته");
  });
  it("keeps the server message for 200", () => {
    const r = shapeResult(200, { ok: true, message: "x" });
    expect(r.ok).toBe(true);
    expect(r.data.message).toBe("x");
  });
});

describe("photoUrl", () => {
  test("a new photo gets a new address, so the old one is not shown from the browser's cache", () => {
    expect(photoUrl("a1b2c3")).toBe("/api/sport-portal/photo?v=a1b2c3");
    expect(photoUrl("ff00")).not.toBe(photoUrl("a1b2c3"));
  });
  test("without a version it is the plain address", () => {
    expect(photoUrl(null)).toBe("/api/sport-portal/photo");
  });
});
