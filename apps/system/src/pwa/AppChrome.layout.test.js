// The update and install bars sat over the buttons at the end of the page (owner, 2026-11-04).
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import AppChrome from "./AppChrome";

const fs = require("fs");
const path = require("path");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("the bars are in the page's flow, stuck to the bottom", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<AppChrome />); });
  act(() => { window.dispatchEvent(new Event("offline")); });
  const bars = host.querySelector('[data-testid="app-chrome"]');
  expect(bars.style.position).toBe("sticky");
  expect(bars.style.bottom).toBe("0px");
  act(() => { window.dispatchEvent(new Event("online")); });
  act(() => { root.unmount(); });
  host.remove();
});

test("the page grows with its content, so the bars come after it", () => {
  const routes = read("Components/Routes/Routes.jsx");
  expect(routes).toContain('minHeight: "100vh"');
  expect(routes).not.toContain('height: "100vh"');
  expect(read("index.css")).toMatch(/#root \{\s*min-height: 100%;/);
});

test("the report button comes before the bars and rises above them", () => {
  const index = read("index.js");
  expect(index.indexOf("<ReportProblem />")).toBeLessThan(index.indexOf("<AppChrome />"));
  const css = read("Components/Global/ReportProblem/ReportProblem.css");
  expect(css).toContain("var(--app-chrome-height, 0px)");
  expect(css).toMatch(/\.report-room \{ height: 52px; \}/);
});
