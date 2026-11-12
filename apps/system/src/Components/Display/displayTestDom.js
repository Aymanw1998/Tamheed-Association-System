// Test-only DOM helpers for the display tests (this app has no Testing Library).
import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted = [];
export function render(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(element));
  mounted.push({ host, root });
  return { host, rerender: (next) => act(() => root.render(next)) };
}
export function cleanup() {
  mounted.forEach(({ host, root }) => { act(() => root.unmount()); host.remove(); });
  mounted = [];
}
export const flush = async () => { for (let i = 0; i < 3; i += 1) await act(async () => { await Promise.resolve(); }); };

const matches = (el, text) => {
  const value = (el.textContent || "").trim();
  return text instanceof RegExp ? text.test(value) : value === text;
};
// The deepest elements whose text matches.
export function allByText(text, scope = document.body) {
  return [...scope.querySelectorAll("*")].filter((el) => matches(el, text) && ![...el.children].some((child) => matches(child, text)));
}
export const queryByText = (text, scope) => allByText(text, scope)[0] || null;
export function byText(text, scope) {
  const found = queryByText(text, scope);
  if (!found) throw new Error(`text not found: ${text}`);
  return found;
}
export const allByTestId = (id, scope = document.body) => [...scope.querySelectorAll(`[data-testid="${id}"]`)];
export function byTestId(id, scope) {
  const found = allByTestId(id, scope)[0];
  if (!found) throw new Error(`test id not found: ${id}`);
  return found;
}
export { React, act };
