import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

import { TourProvider } from "./TourProvider";
import { I18nProvider } from "../i18n/I18nContext";
import { RELEASES } from "./releases";
import { loadTourState, saveKnownKeys, saveSeenReleases } from "../WebServer/services/tours/functionsTours";
import { startDemo, stopDemo } from "../journey/demoMode";

// Jest 27 (CRA 5) ignores package "exports" (see journey/JourneyProvider.test.js).
jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});

jest.mock("../WebServer/services/tours/functionsTours", () => ({
  loadTourState: jest.fn(),
  saveKnownKeys: jest.fn(),
  saveSeenReleases: jest.fn(),
}));
jest.mock("../utils/unsavedChanges", () => ({ confirmLeave: jest.fn(() => Promise.resolve(true)) }));

// The journey is driven by the test.
let mockJourney;
jest.mock("../journey/JourneyProvider", () => ({ useJourney: () => mockJourney }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const ALL_SEEN = RELEASES.map((r) => r.id);
let container;
let root;

const journey = (extra = {}) => ({
  offer: jest.fn(() => false),
  startJourney: jest.fn(async () => true),
  stopJourney: jest.fn(),
  running: false,
  currentChapterId: null,
  settled: true,
  offering: false,
  tours: {},
  ...extra,
});

const tree = (path) => (
  <I18nProvider>
    <MemoryRouter initialEntries={[path]}>
      <TourProvider>
        <div />
      </TourProvider>
    </MemoryRouter>
  </I18nProvider>
);

async function mount(path = "/profile") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(tree(path)));
}

// Re-renders with the current mockJourney.
async function rerender(path = "/profile") {
  await act(async () => root.render(tree(path)));
}

const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(text));

beforeEach(() => {
  mockJourney = journey();
  localStorage.setItem("permissions", JSON.stringify(["students.view", "files.use"]));
  loadTourState.mockResolvedValue({ tours: {}, knownKeys: ["students.view"], seenReleases: ALL_SEEN });
});

afterEach(async () => {
  stopDemo();
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
});

test("the new-access card waits for the journey offer, then «أرني» runs that section's chapter alone", async () => {
  mockJourney = journey({ offering: true });
  await mount();
  expect(document.body.textContent).not.toContain("صلاحيات جديدة");

  mockJourney = journey({ settled: false });
  await rerender();
  expect(document.body.textContent).not.toContain("صلاحيات جديدة");

  mockJourney = journey({ running: true });
  await rerender();
  expect(document.body.textContent).not.toContain("صلاحيات جديدة");

  mockJourney = journey();
  await rerender();
  expect(document.body.textContent).toContain("صلاحيات جديدة");
  await act(async () => {
    button("أرني").click();
  });
  expect(mockJourney.startJourney).toHaveBeenCalledWith("journey-files", { only: true });
  expect(document.body.textContent).not.toContain("صلاحيات جديدة");
});

test("what's new comes after the access card; the journey release's «أرني» starts the full journey", async () => {
  loadTourState.mockResolvedValue({ tours: {}, knownKeys: ["students.view", "files.use"], seenReleases: [] });
  await mount();
  expect(document.body.textContent).toContain("ما الجديد");
  await act(async () => {
    button("أرني").click();
  });
  expect(mockJourney.startJourney).toHaveBeenCalledWith("journey-intro", { only: false });
});

test("«شرح هذه الشاشة» runs the open screen's chapter alone", async () => {
  loadTourState.mockResolvedValue({ tours: {}, knownKeys: ["students.view", "files.use"], seenReleases: ALL_SEEN });
  await mount("/students/abc");
  await act(async () => {
    document.querySelector('[data-tour="help-button"]').click();
  });
  await act(async () => {
    button("شرح هذه الشاشة").click();
  });
  expect(mockJourney.startJourney).toHaveBeenCalledWith("journey-students", { only: true });
});

test("the help center lists the chapters with their marks, including the assistant", async () => {
  localStorage.setItem("permissions", JSON.stringify(["students.view", "files.use", "ai.use"]));
  loadTourState.mockResolvedValue({ tours: {}, knownKeys: ["students.view", "files.use", "ai.use"], seenReleases: ALL_SEEN });
  mockJourney = journey({ tours: { "journey-students": { status: "done" }, "journey-files": { status: "skipped" } } });
  await mount("/profile");
  await act(async () => {
    document.querySelector('[data-tour="help-button"]').click();
  });
  const rows = [...document.querySelectorAll('[data-chapter]')];
  const row = (id) => rows.find((r) => r.getAttribute("data-chapter") === id);
  expect(row("journey-students").textContent).toContain("أنهيته");
  expect(row("journey-files").textContent).toContain("تخطّيته");
  expect(row("journey-assistant")).toBeTruthy();
  expect(row("journey-vehicles")).toBeUndefined();
  await act(async () => {
    row("journey-assistant").querySelector("button").click();
  });
  expect(mockJourney.startJourney).toHaveBeenCalledWith("journey-assistant", { only: true });
});

test("«المسار التدريبي كاملًا» shows the guide's offer, or starts from the first chapter when there is nothing to offer", async () => {
  await mount();
  mockJourney.offer.mockReturnValueOnce(true);
  await act(async () => {
    document.querySelector('[data-tour="help-button"]').click();
  });
  await act(async () => {
    button("المسار التدريبي كاملًا").click();
  });
  expect(mockJourney.offer).toHaveBeenCalled();
  expect(mockJourney.startJourney).not.toHaveBeenCalled();

  await act(async () => {
    document.querySelector('[data-tour="help-button"]').click();
  });
  await act(async () => {
    button("المسار التدريبي كاملًا").click();
  });
  expect(mockJourney.startJourney).toHaveBeenCalledWith("journey-intro");
});

test("a section visited in training mode keeps its new badge; a real visit ends it", async () => {
  startDemo();
  await mount("/files");
  expect(saveKnownKeys).not.toHaveBeenCalled();

  // The same visit on real data.
  await act(async () => root.unmount());
  container.remove();
  stopDemo();
  await mount("/files");
  expect(saveKnownKeys).toHaveBeenCalledWith(["files.use"]);
});

test("once the journey offer is answered, its release is seen and what's new skips it", async () => {
  loadTourState.mockResolvedValue({ tours: {}, knownKeys: ["students.view", "files.use"], seenReleases: [] });
  mockJourney = journey({ offerAnswered: true });
  await mount();
  expect(saveSeenReleases).toHaveBeenCalledWith(["2026-10-22-guided-journey"]);
  // The other unseen release still shows.
  expect(document.body.textContent).toContain("مركز المساعدة الجديد");
  expect(document.body.textContent).not.toContain("المسار التدريبي");
});

test("an unanswered offer leaves the journey release in what's new", async () => {
  loadTourState.mockResolvedValue({ tours: {}, knownKeys: ["students.view", "files.use"], seenReleases: [] });
  await mount();
  expect(saveSeenReleases).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("المسار التدريبي");
});
