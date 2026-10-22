import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";

import { JourneyProvider, useJourney } from "./JourneyProvider";
import { demoEpoch, isDemo, stopDemo } from "./demoMode";
import { confirmLeave } from "../utils/unsavedChanges";
import { loadTourState, saveTour } from "../WebServer/services/tours/functionsTours";

// Jest 27 (CRA 5) ignores package "exports", so react-router-dom 7 cannot load
// its "react-router/dom" entry; the hooks and MemoryRouter come from react-router
// (which needs TextEncoder, missing from this jsdom).
jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});

jest.mock("../WebServer/services/tours/functionsTours", () => ({ loadTourState: jest.fn(), saveTour: jest.fn() }));
jest.mock("../utils/unsavedChanges", () => ({ confirmLeave: jest.fn() }));

// CRA resets mock implementations before each test.
beforeEach(() => {
  loadTourState.mockResolvedValue({ tours: {}, knownKeys: [], seenReleases: [] });
  saveTour.mockResolvedValue(undefined);
  confirmLeave.mockResolvedValue(true);
});

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let api;
let path;

function Probe() {
  api = useJourney();
  path = useLocation().pathname;
  return null;
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/profile"]}>
        <JourneyProvider>
          <Probe />
        </JourneyProvider>
      </MemoryRouter>,
    );
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  stopDemo();
});

test("stopJourney resets demo store and remounts", async () => {
  await mount();
  const before = demoEpoch();

  await act(async () => {
    await api.startJourney();
  });
  expect(confirmLeave).toHaveBeenCalled();
  expect(isDemo()).toBe(true);
  expect(api.running).toBe(true);
  expect(api.currentChapterId).toBe("journey-intro");
  expect(path).toBe("/dashboard");

  await act(async () => {
    api.stopJourney();
  });
  expect(isDemo()).toBe(false);
  expect(demoEpoch()).toBe(before + 2);
  expect(api.running).toBe(false);
  expect(path).toBe("/dashboard");
});

test("a refused leave starts nothing", async () => {
  confirmLeave.mockImplementationOnce(() => Promise.resolve(false));
  await mount();
  const before = demoEpoch();
  await act(async () => {
    await api.startJourney();
  });
  expect(isDemo()).toBe(false);
  expect(demoEpoch()).toBe(before);
  expect(api.running).toBe(false);
  expect(path).toBe("/profile");
});

test("the guide's skip-chapter button saves the chapter as skipped", async () => {
  await mount();
  await act(async () => {
    await api.startJourney("journey-intro");
  });
  // The first intro step has no target, so the guide shows at once.
  const skip = [...container.querySelectorAll("button")].find((b) => b.textContent === "تخطّي الفصل");
  expect(skip).toBeTruthy();
  await act(async () => {
    skip.click();
  });
  expect(saveTour).toHaveBeenCalledWith("journey-intro", "skipped", 1);
});

test("real clicks on the page are blocked while the journey runs", async () => {
  await mount();
  const page = document.createElement("button");
  const clicked = jest.fn();
  page.addEventListener("click", clicked);
  document.body.appendChild(page);
  await act(async () => {
    await api.startJourney();
  });
  page.click();
  expect(clicked).not.toHaveBeenCalled();
  const flagged = new MouseEvent("click", { bubbles: true });
  flagged.__journey = true;
  page.dispatchEvent(flagged);
  expect(clicked).toHaveBeenCalledTimes(1);
  await act(async () => {
    api.stopJourney();
  });
  page.click();
  expect(clicked).toHaveBeenCalledTimes(2);
  page.remove();
});

test("the sign-in offer stays off while JOURNEY_AUTO_OFFER is false", async () => {
  await mount();
  expect(container.textContent).not.toContain("ابدأ الآن");
});

const button = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(text));

test("Next walks the chapter, celebrates, saves it as done and ends on the last chapter", async () => {
  // Targets on screen (jsdom does no layout).
  const rects = jest.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}]);
  document.body.insertAdjacentHTML("beforeend", '<nav data-tour="menu"></nav><button data-tour="help-button">?</button>');
  await mount();
  await act(async () => {
    await api.startJourney();
  });
  const titles = [];
  for (let i = 0; i < 10 && !container.querySelector('[data-mood="celebrate"]'); i += 1) {
    titles.push(container.querySelector("h3").textContent);
    await act(async () => {
      button("التالي").click();
    });
  }
  expect(titles[0]).toBe("أهلًا، أنا تمهيد");
  expect(titles).toContain("القائمة الرئيسية");
  expect(container.querySelector('[data-mood="celebrate"]')).not.toBeNull();
  expect(saveTour).toHaveBeenCalledWith("journey-intro", "done", 1);

  await act(async () => {
    button("التالي").click();
  });
  expect(api.running).toBe(false);
  expect(isDemo()).toBe(false);
  expect(path).toBe("/dashboard");
  document.querySelectorAll('[data-tour="menu"], [data-tour="help-button"]').forEach((el) => el.remove());
  rects.mockRestore();
});

test("offer() shows the intro card; its skip saves journey-intro as skipped", async () => {
  await mount();
  await act(async () => {
    api.offer();
  });
  expect(button("ابدأ الآن")).toBeTruthy();
  expect(button("لاحقًا")).toBeTruthy();
  await act(async () => {
    button("تخطٍّ").click();
  });
  expect(saveTour).toHaveBeenCalledWith("journey-intro", "skipped", 1);
  expect(container.querySelector('[data-testid="journey-offer"]')).toBeNull();
});
