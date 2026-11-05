import { WINDOW_MS, clearProblem, noteCrash, noteFailure, recentProblem, sectionOf } from "./problemLog";

const failure = ({ status, requestId, url = "/student/1?x=1", method = "put", code } = {}) => ({
  code,
  message: "Request failed",
  config: { url, method },
  ...(status ? { response: { status, headers: { "x-request-id": requestId }, data: { message: "حدث خطأ" } } } : {}),
});

beforeEach(() => clearProblem());

test("a server error is kept with its id", () => {
  noteFailure(failure({ status: 500, requestId: "abc" }), 1000);
  const problem = recentProblem(1000);
  expect(problem.requestId).toBe("abc");
  expect(problem.kind).toBe("server");
  expect(problem.message).toBe("حدث خطأ");
});

test("errors that are not faults are not kept", () => {
  for (const status of [400, 401, 403, 404, 409, 423, 429]) noteFailure(failure({ status, requestId: "x" }), 1000);
  noteFailure(failure({ code: "ERR_CANCELED" }), 1000);
  expect(recentProblem(1000)).toBeNull();
});

test("a server that does not answer counts, without the query string", () => {
  noteFailure(failure({}), 1000);
  const problem = recentProblem(1000);
  expect(problem.kind).toBe("network");
  expect(problem.action).toBe("PUT /api/student/1");
});

test("a device with no connection is not a fault of the system", () => {
  const spy = jest.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
  noteFailure(failure({}), 1000);
  spy.mockRestore();
  expect(recentProblem(1000)).toBeNull();
});

test("failures of the report itself are not reported", () => {
  noteFailure(failure({ status: 500, requestId: "x", url: "/bug-reports" }), 1000);
  expect(recentProblem(1000)).toBeNull();
});

test("two minutes and no more", () => {
  noteFailure(failure({ status: 500, requestId: "abc" }), 1000);
  expect(recentProblem(1000 + WINDOW_MS)).not.toBeNull();
  expect(recentProblem(1000 + WINDOW_MS + 1)).toBeNull();
  expect(WINDOW_MS).toBe(120000);
});

test("a crashed screen is kept with its message", () => {
  noteCrash(new Error("boom"), 1000);
  expect(recentProblem(1000)).toMatchObject({ kind: "crash", message: "boom", ageMs: 0 });
});

test("the section follows the address", () => {
  expect(sectionOf("/students/123/edit")).toBe("الطلاب");
  expect(sectionOf("/vehicles")).toBe("المركبات والمقطورات");
  expect(sectionOf("/sports")).toBe("الرياضة");
  expect(sectionOf("/somewhere")).toBe("");
});

test("a live ticket with no answer is not the problem a press reports: it retries by itself", () => {
  clearProblem();
  noteFailure({ message: "timeout of 15000ms exceeded", code: "ECONNABORTED", config: { method: "post", url: "/live/ticket" } }, 1000);
  expect(recentProblem(1000)).toBeNull();
});

test("a server error on the live ticket, and no answer on anything else, still count", () => {
  clearProblem();
  noteFailure({ message: "boom", response: { status: 500, headers: {}, data: {} }, config: { method: "post", url: "/live/ticket" } }, 1000);
  expect(recentProblem(1000).kind).toBe("server");
  clearProblem();
  noteFailure({ message: "timeout of 15000ms exceeded", config: { method: "get", url: "/lesson" } }, 1000);
  expect(recentProblem(1000).kind).toBe("network");
  clearProblem();
});
