// Small helpers for the component tests (no testing-library in this app).
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Toaster, clearToasts } from "./ui/toast.jsx";

global.IS_REACT_ACT_ENVIRONMENT = true;

const mounted = [];

export async function mount(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  // The screens report results as toasts; every mount shows them (toastText()).
  await act(async () => root.render(<>{element}<Toaster /></>));
  return container;
}

export async function unmountAll() {
  while (mounted.length) {
    const { root, container } = mounted.pop();
    await act(async () => root.unmount());
    container.remove();
  }
  await act(async () => clearToasts());
}

// The text of the toasts on screen (they render outside the container).
export const toastText = () => [...document.body.querySelectorAll("[role=status], [role=alert]")].map((el) => el.textContent).join(" ");

// A response the way api.js shapes it.
export const ok = (data = {}) => Promise.resolve({ status: 200, ok: true, data: { ok: true, ...data } });
export const fail = (status, data = {}) => Promise.resolve({ status, ok: false, data: { ok: false, ...data } });

export const byText = (container, selector, text) =>
  [...container.querySelectorAll(selector)].find((el) => el.textContent.trim() === text);
export const button = (container, text) => byText(container, "button", text);

export async function click(el) {
  if (!el) throw new Error("element to click not found");
  await act(async () => { el.click(); });
}

export async function type(input, value) {
  if (!input) throw new Error("input not found");
  const proto = input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}

export async function submit(form) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

export const flush = () => act(async () => { await Promise.resolve(); });
