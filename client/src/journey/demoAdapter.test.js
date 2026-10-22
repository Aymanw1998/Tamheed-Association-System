jest.mock("axios", () => {
  const path = require("path");
  return jest.requireActual(path.join(path.dirname(require.resolve("axios/package.json")), "dist/node/axios.cjs"));
});

import axios from "axios";
import { installDemoAdapter } from "./demoAdapter";
import { ALLOWED_DURING_DEMO } from "./demoRoutes";
import { getDemoStore, startDemo, stopDemo } from "./demoMode";

let calls;
let instance;

const fakeAdapter = (config) => {
  calls.push(`${config.method} ${config.url}`);
  return Promise.resolve({ data: { ok: true, real: true }, status: 200, statusText: "OK", headers: {}, config, request: {} });
};

beforeEach(() => {
  calls = [];
  instance = axios.create({ baseURL: "/api", adapter: fakeAdapter });
  installDemoAdapter(instance);
});

afterEach(() => {
  stopDemo();
  jest.restoreAllMocks();
});

test("off demo, every request is passed through", async () => {
  await instance.get("/student");
  await instance.post("/student", { tz: "1" });
  await instance.delete("/unknown");
  expect(calls).toEqual(["get /student", "post /student", "delete /unknown"]);
});

test("in demo, a GET to /student never reaches the adapter and returns demo rows", async () => {
  startDemo();
  const res = await instance.get("/student");
  expect(calls).toEqual([]);
  expect(res.status).toBe(200);
  expect(res.data.students.map((s) => s._id)).toEqual(getDemoStore().students.map((s) => s._id));
});

test("in demo, a write changes the store and never reaches the adapter", async () => {
  startDemo();
  const res = await instance.post("/student", { tz: "5", firstname: "طالب", lastname: "جديد" });
  expect(res.status).toBe(201);
  expect(getDemoStore().students.some((s) => s.lastname === "جديد")).toBe(true);
  expect(calls).toEqual([]);
});

test("blocks unknown writes", async () => {
  startDemo();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  for (const method of ["post", "put", "patch", "delete"]) {
    // eslint-disable-next-line no-await-in-loop
    await expect(instance.request({ method, url: "/unknown", data: { a: 1 } })).rejects.toMatchObject({
      response: { status: 409, data: { ok: false, code: "DEMO_BLOCKED" } },
    });
  }
  expect(calls).toEqual([]);
});

test("an unknown GET answers an empty result", async () => {
  startDemo();
  const res = await instance.get("/somewhere/else");
  expect(res.data).toEqual({ ok: true, result: [] });
  expect(calls).toEqual([]);
});

test("/tours/item/x and /auth/refresh pass through in demo", async () => {
  startDemo();
  await instance.post("/tours/item/x", { status: "done" });
  await instance.post("/auth/refresh");
  await instance.post("/auth/me", {});
  await instance.get("/tours");
  expect(calls).toEqual(["post /tours/item/x", "post /auth/refresh", "post /auth/me", "get /tours"]);
});

test("resetting another user's tours is not allowed in demo", async () => {
  startDemo();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await expect(instance.post("/tours/reset/123")).rejects.toMatchObject({ response: { status: 409 } });
  expect(calls).toEqual([]);
  expect(ALLOWED_DURING_DEMO.some((re) => re.test("/tours/reset/123"))).toBe(false);
});

test("a demo error status rejects like a server error", async () => {
  startDemo();
  await expect(instance.get("/student/does-not-exist")).rejects.toMatchObject({ response: { status: 404 } });
});

test("the adapter set later on the instance is still the one used off demo", async () => {
  const later = [];
  instance.defaults.adapter = (config) => {
    later.push(config.url);
    return Promise.resolve({ data: {}, status: 200, statusText: "OK", headers: {}, config, request: {} });
  };
  await instance.get("/x");
  startDemo();
  await instance.get("/tours");
  expect(later).toEqual(["/x", "/tours"]);
});
