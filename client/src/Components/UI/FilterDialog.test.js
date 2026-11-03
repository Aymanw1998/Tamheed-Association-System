import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import FilterDialog from "./FilterDialog";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Owner, 2026-11-03: on every screen the filters sit in a window opened by a
// «فلتر» button, and the word is «فلتر» (not «تصفية»).
let host, root;
const render = async (ui) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(ui));
};
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const button = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label));
const dialog = () => document.querySelector('[role="dialog"]');
const click = (el) => act(async () => { el.click(); });

function Live() {
  const [room, setRoom] = useState("all");
  return (
    <>
      <FilterDialog count={room !== "all" ? 1 : 0} onClear={() => setRoom("all")} tour="x-filter" clearTour="x-clear" closeTour="x-close">
        <select aria-label="room" value={room} onChange={(e) => setRoom(e.target.value)}>
          <option value="all">all</option>
          <option value="a">a</option>
        </select>
      </FilterDialog>
      <p data-testid="room">{room}</p>
    </>
  );
}

test("the filters stay hidden until «فلتر» opens them, and «إغلاق» closes the window", async () => {
  await render(<Live />);
  expect(dialog()).toBeNull();
  expect(document.querySelector('select[aria-label="room"]')).toBeNull();
  await click(button("فلتر"));
  expect(dialog()).not.toBeNull();
  expect(dialog().querySelector("h3").textContent).toBe("فلتر");
  expect(dialog().querySelector('select[aria-label="room"]')).not.toBeNull();
  await click(button("إغلاق"));
  expect(dialog()).toBeNull();
});

test("the button counts active filters, and «مسح الفلتر» beside it clears them", async () => {
  await render(<Live />);
  expect(button("مسح الفلتر")).toBeUndefined();
  await click(button("فلتر"));
  const select = dialog().querySelector("select");
  await act(async () => {
    select.value = "a";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await click(button("إغلاق"));
  expect(document.querySelector('[data-tour="x-filter"]').textContent).toContain("1");
  await click(document.querySelector('[data-tour="x-clear"]'));
  expect(host.querySelector('[data-testid="room"]').textContent).toBe("all");
  expect(button("مسح الفلتر")).toBeUndefined();
});

test("Escape closes the window", async () => {
  await render(<Live />);
  await click(button("فلتر"));
  await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  expect(dialog()).toBeNull();
});

test("with onApply the window is a form: «تطبيق» applies and closes", async () => {
  const onApply = jest.fn();
  await render(<FilterDialog onApply={onApply}><input aria-label="q" /></FilterDialog>);
  await click(button("فلتر"));
  await click(button("تطبيق"));
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(dialog()).toBeNull();
});
