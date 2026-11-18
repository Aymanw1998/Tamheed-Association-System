import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import FilterDialog from "./FilterDialog";

// Codex full review, 2026-11-18: the filter window takes the keyboard focus,
// keeps Tab inside, and gives the focus back to «فلتر» when it closes.
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <div>
      <button type="button">behind</button>
      <FilterDialog count={1} onClear={() => {}}>
        <input aria-label="first" />
      </FilterDialog>
    </div>
  ));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const tab = (shiftKey = false) => {
  const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
  document.activeElement.dispatchEvent(event);
  return event;
};

test("opening moves focus into the window; Tab cycles inside; closing returns it", async () => {
  const opener = [...container.querySelectorAll("button")].find((b) => b.textContent.startsWith("فلتر"));
  opener.focus();
  await act(async () => opener.click());
  const dialog = container.querySelector('[role="dialog"]');
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(document.activeElement.getAttribute("aria-label")).toBe("first");

  // Shift+Tab from the first goes to the last button, Tab from the last to the first.
  expect(tab(true).defaultPrevented).toBe(true);
  expect(document.activeElement.textContent).toBe("إغلاق");
  expect(tab().defaultPrevented).toBe(true);
  expect(document.activeElement.getAttribute("aria-label")).toBe("first");

  await act(async () => document.activeElement.closest('[role="dialog"]').querySelector("button:last-of-type").click());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
});
