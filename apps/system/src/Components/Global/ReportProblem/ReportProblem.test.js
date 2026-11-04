import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("../../../WebServer/services/api", () => ({ __esModule: true, default: { post: jest.fn() }, getAuthToken: jest.fn(() => "token") }));
jest.mock("../../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import api, { getAuthToken } from "../../../WebServer/services/api";
import { toast } from "../../../ALERT/SystemToasts.jsx";
import { clearProblem, noteFailure } from "../../../WebServer/services/problemLog";
import ReportProblem from "./ReportProblem";

global.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let container;

const render = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<ReportProblem />); });
};
const press = async () => {
  await act(async () => { container.querySelector("button.report-problem").click(); });
};
const fault = () => noteFailure({ config: { url: "/student/1", method: "put" }, response: { status: 500, headers: { "x-request-id": "abc" }, data: {} } });

beforeEach(() => { clearProblem(); api.post.mockReset(); toast.success.mockClear(); toast.error.mockClear(); getAuthToken.mockReturnValue("token"); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test("signed out there is no button", async () => {
  getAuthToken.mockReturnValue(null);
  await render();
  expect(container.querySelector("button.report-problem")).toBeNull();
});

test("after an error the button says so, and one press sends it without a window", async () => {
  api.post.mockResolvedValue({ data: { ok: true } });
  fault();
  await render();
  expect(container.textContent).toContain("حدث خطأ");
  await press();
  expect(api.post).toHaveBeenCalledTimes(1);
  const [url, body] = api.post.mock.calls[0];
  expect(url).toBe("/bug-reports");
  expect(body).toMatchObject({ mode: "auto", requestId: "abc" });
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(toast.success).toHaveBeenCalled();
});

test("with no error the press sends nothing and opens the window", async () => {
  await render();
  await press();
  expect(api.post).not.toHaveBeenCalled();
  expect(container.querySelector("[role=dialog]")).not.toBeNull();
  const options = [...container.querySelectorAll("select option")].map((o) => o.textContent);
  expect(options).toEqual(["عطل", "اقتراح تحسين", "مشكلة ملموسة"]);
  expect(container.querySelector("textarea")).not.toBeNull();
  expect(container.querySelector("input[type=file]").accept).toContain("image/");
});

test("when the server finds the error too old, the window opens instead", async () => {
  api.post.mockRejectedValue({ response: { status: 409, data: { code: "NO_RECENT_ERROR" } } });
  fault();
  await render();
  await press();
  expect(container.querySelector("[role=dialog]")).not.toBeNull();
  expect(toast.error).not.toHaveBeenCalled();
});

test("the window sends its kind, text and picture", async () => {
  api.post.mockResolvedValue({ data: { ok: true } });
  await render();
  await press();
  const setValue = (el, value, proto) => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  };
  await act(async () => { setValue(container.querySelector("select"), "suggestion", HTMLSelectElement.prototype); });
  await act(async () => { setValue(container.querySelector("textarea"), "فكرة جيدة", HTMLTextAreaElement.prototype); });
  await act(async () => { container.querySelector("[role=dialog] form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  const [url, body] = api.post.mock.calls[0];
  expect(url).toBe("/bug-reports");
  expect(body.get("mode")).toBe("manual");
  expect(body.get("type")).toBe("suggestion");
  expect(body.get("text")).toBe("فكرة جيدة");
  expect(container.querySelector("[role=dialog]")).toBeNull();
});

test("an empty text is not sent", async () => {
  await render();
  await press();
  await act(async () => { container.querySelector("[role=dialog] form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(api.post).not.toHaveBeenCalled();
  expect(container.querySelector("[role=alert]").textContent).toContain("اكتب");
});
