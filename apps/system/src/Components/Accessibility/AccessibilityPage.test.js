import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import AccessibilityPage from "./AccessibilityPage";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

test("the accessibility statement names the standard and how to reach the association", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<I18nProvider><AccessibilityPage /></I18nProvider>));
  expect(container.querySelector("h1").textContent).toContain("تصريح إتاحة");
  expect(container.textContent).toContain("5568");
  expect(container.querySelector('a[href^="mailto:"]')).not.toBeNull();
  // The coordinator the law asks for (owner, 2026-11-18).
  expect(container.textContent).toContain("أيمن الوهباني");
  expect(container.querySelector('a[href="tel:0508241000"]').textContent).toBe("050-824-1000");
  act(() => root.unmount());
  container.remove();
});
