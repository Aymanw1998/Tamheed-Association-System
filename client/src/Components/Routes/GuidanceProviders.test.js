import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("../../journey/JourneyProvider", () => ({
  JourneyProvider: ({ children }) => <div data-testid="journey">{children}</div>,
}));
jest.mock("../../tours/TourProvider", () => ({
  TourProvider: ({ children }) => <div data-testid="tours">{children}</div>,
}));

import GuidanceProviders, { GUIDANCE_ENABLED } from "./GuidanceProviders";

global.IS_REACT_ACT_ENVIRONMENT = true;

// The owner turned the system's guidance off for now (2026-11-01): no guided
// journey invitation, no "?" help center, no "what's new" or "new" badges.

let container, root;
const mount = async (props) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<GuidanceProviders {...props}><p>page</p></GuidanceProviders>));
};
afterEach(() => {
  if (!root) return;
  act(() => root.unmount());
  container.remove();
  root = null;
});

test("the guidance is off for now", () => {
  expect(GUIDANCE_ENABLED).toBe(false);
});

test("off: the page renders without the journey and the help center", async () => {
  await mount({ enabled: false });
  expect(container.textContent).toBe("page");
  expect(container.querySelector('[data-testid="journey"]')).toBeNull();
  expect(container.querySelector('[data-testid="tours"]')).toBeNull();
});

test("on: the journey wraps the help center, which wraps the page", async () => {
  await mount({ enabled: true });
  const journey = container.querySelector('[data-testid="journey"]');
  expect(journey.querySelector('[data-testid="tours"]').textContent).toBe("page");
});
