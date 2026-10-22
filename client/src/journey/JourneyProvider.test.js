import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

import { JourneyProvider, useJourney } from "./JourneyProvider";
import { demoEpoch, isDemo, stopDemo } from "./demoMode";
import { CHAPTERS as mockChapters } from "./chapters";
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

// The real chapter list, plus test chapters some tests add.
jest.mock("./chapters", () => ({ CHAPTERS: [] }));
const INTRO = jest.requireActual("./chapters/intro").default;
const ACTION_CHAPTER = {
  id: "journey-test",
  title: "فصل تجريبي",
  route: "/students",
  requires: null,
  steps: [
    { target: null, mood: "explain", title: "خطوة الضغط", body: "نص", action: { type: "click", target: "late-button" } },
    { target: null, mood: "explain", title: "خطوة ثانية", body: "نص" },
  ],
};
const NAV_CHAPTER = {
  id: "journey-nav",
  title: "فصل التنقل",
  route: "/students",
  requires: null,
  steps: [
    { target: null, mood: "explain", title: "أذهب إلى الدروس", body: "نص", action: { type: "navigate", path: "/lessons" } },
    { target: null, mood: "explain", title: "في الدروس", body: "نص" },
  ],
};
const MISSING_CHAPTER = {
  id: "journey-missing",
  title: "فصل بلا عناصر",
  route: "/students",
  requires: null,
  steps: [{ target: "not-on-page", mood: "point", title: "لا يظهر", body: "نص" }],
};

// CRA resets mock implementations before each test.
beforeEach(() => {
  mockChapters.splice(0, mockChapters.length, INTRO);
  loadTourState.mockResolvedValue({ tours: {}, knownKeys: [], seenReleases: [] });
  saveTour.mockResolvedValue(undefined);
  confirmLeave.mockResolvedValue(true);
});

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let api;
let path;
let go;
let mounted = false;

function Probe() {
  api = useJourney();
  path = useLocation().pathname;
  go = useNavigate();
  return null;
}

async function mount(props = {}) {
  mounted = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/profile"]}>
        <JourneyProvider {...props}>
          <Probe />
        </JourneyProvider>
      </MemoryRouter>,
    );
  });
}

async function unmount() {
  if (!mounted) return;
  mounted = false;
  await act(async () => root.unmount());
}

afterEach(async () => {
  await unmount();
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

test("at sign-in a user without journey-intro is offered the journey, even after the old welcome", async () => {
  loadTourState.mockResolvedValue({ tours: { welcome: { status: "done", version: 1 } }, knownKeys: [], seenReleases: [] });
  await mount();
  expect(container.textContent).toContain("ابدأ الآن");
  expect(api.offering).toBe(true);
  expect(api.settled).toBe(true);
});

test("no sign-in offer once journey-intro is recorded and nothing is left", async () => {
  loadTourState.mockResolvedValue({ tours: { "journey-intro": { status: "done", version: 1 } }, knownKeys: [], seenReleases: [] });
  await mount();
  expect(container.querySelector('[data-testid="journey-offer"]')).toBeNull();
  expect(api.offering).toBe(false);
  expect(api.settled).toBe(true);
  expect(api.tours["journey-intro"].status).toBe("done");
});

test("the offer is settled (nothing to wait for) when the tour state fails to load", async () => {
  loadTourState.mockResolvedValue(null);
  await mount();
  expect(api.settled).toBe(true);
  expect(api.offering).toBe(false);
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
  // The help center's marks read this.
  expect(api.tours["journey-intro"].status).toBe("skipped");
  expect(api.offering).toBe(false);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("pausing during a pending click cancels it: the target showing later is never clicked", async () => {
  mockChapters.push(ACTION_CHAPTER);
  await mount();
  await act(async () => {
    await api.startJourney("journey-test", { only: true });
  });
  expect(container.querySelector("h3").textContent).toBe("خطوة الضغط");
  await act(async () => {
    button("التالي").click(); // the click action now waits for "late-button"
  });
  await act(async () => {
    api.stopJourney();
  });
  expect(isDemo()).toBe(false);
  const late = document.createElement("button");
  late.setAttribute("data-tour", "late-button");
  const clicked = jest.fn();
  late.addEventListener("click", clicked);
  document.body.appendChild(late);
  await act(async () => {
    await sleep(300);
  });
  expect(clicked).not.toHaveBeenCalled();
  late.remove();
});

test("unmounting while running ends training mode", async () => {
  await mount();
  await act(async () => {
    await api.startJourney();
  });
  expect(isDemo()).toBe(true);
  await unmount();
  expect(isDemo()).toBe(false);
});

test("a start whose leave check answers after unmount starts nothing", async () => {
  let answer;
  confirmLeave.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
  await mount();
  let started;
  await act(async () => {
    started = api.startJourney();
  });
  await unmount();
  answer(true);
  expect(await started).toBe(false);
  expect(isDemo()).toBe(false);
});

test("leaving the chapter's pages by hand pauses the journey without saving it", async () => {
  await mount();
  await act(async () => {
    await api.startJourney();
  });
  expect(path).toBe("/dashboard");
  await act(async () => {
    go("/profile"); // like the browser's Back button
  });
  expect(api.running).toBe(false);
  expect(isDemo()).toBe(false);
  expect(path).toBe("/dashboard");
  expect(saveTour).not.toHaveBeenCalledWith("journey-intro", "done", 1);
});

test("a page the engine opens itself does not pause the journey", async () => {
  mockChapters.push(NAV_CHAPTER);
  await mount();
  await act(async () => {
    await api.startJourney("journey-nav");
  });
  expect(path).toBe("/students");
  await act(async () => {
    button("التالي").click();
    await sleep(150);
  });
  expect(path).toBe("/lessons");
  expect(api.running).toBe(true);
  expect(container.querySelector("h3").textContent).toBe("في الدروس");
});

test("a chapter none of whose targets showed is not saved as done", async () => {
  mockChapters.push(MISSING_CHAPTER);
  await mount({ targetWaitMs: 50 });
  await act(async () => {
    await api.startJourney("journey-missing");
  });
  await act(async () => {
    await sleep(250);
  });
  expect(saveTour).not.toHaveBeenCalledWith("journey-missing", "done", 1);
  expect(api.running).toBe(false);
  expect(isDemo()).toBe(false);
});

test("single-chapter mode ends after that chapter instead of going on", async () => {
  mockChapters.push(NAV_CHAPTER);
  await mount();
  await act(async () => {
    await api.startJourney("journey-intro", { only: true });
  });
  await act(async () => {
    button("تخطّي الفصل").click();
  });
  expect(saveTour).toHaveBeenCalledWith("journey-intro", "skipped", 1);
  expect(api.running).toBe(false);
  expect(isDemo()).toBe(false);

  // Without "only", skipping moves on to the next chapter.
  await act(async () => {
    await api.startJourney("journey-intro");
  });
  await act(async () => {
    button("تخطّي الفصل").click();
  });
  expect(api.running).toBe(true);
  expect(api.currentChapterId).toBe("journey-nav");
});

test("printable keys and Enter on the page are blocked while running", async () => {
  await mount();
  await act(async () => {
    await api.startJourney();
  });
  const input = document.createElement("input");
  document.body.appendChild(input);
  const key = (k) => {
    const event = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(key("a")).toBe(true);
  expect(key("Enter")).toBe(true);
  expect(key("Backspace")).toBe(true);
  expect(key("Tab")).toBe(false);
  const typed = new Event("beforeinput", { bubbles: true, cancelable: true });
  input.dispatchEvent(typed);
  expect(typed.defaultPrevented).toBe(true);
  input.remove();
});
