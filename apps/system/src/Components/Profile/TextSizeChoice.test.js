import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import TextSizeChoice from "./TextSizeChoice";

global.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); document.documentElement.style.removeProperty("font-size"); });

test("«حجم الخط» offers three sizes and applies the choice at once", async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<TextSizeChoice />));
  const radios = [...container.querySelectorAll('input[type="radio"]')];
  expect(radios.map((r) => r.value)).toEqual(["normal", "large", "xlarge"]);
  expect(radios[0].checked).toBe(true);
  await act(async () => radios[2].click());
  expect(document.documentElement.style.fontSize).toBe("125%");
  expect(radios[2].checked).toBe(true);
});
