import { getTextSize, setTextSize, applyTextSize, TEXT_SIZE_KEY } from "./textSize";

const root = document.documentElement.style;
afterEach(() => { localStorage.clear(); applyTextSize("normal"); });

test("starts at normal with nothing overridden", () => {
  expect(getTextSize()).toBe("normal");
  applyTextSize();
  expect(root.getPropertyValue("--fs-base")).toBe("");
  expect(root.fontSize).toBe("");
});

test("large and extra large scale the type tokens and are kept on this device", () => {
  setTextSize("large");
  expect(localStorage.getItem(TEXT_SIZE_KEY)).toBe("large");
  expect(root.getPropertyValue("--fs-base")).toBe("18px");
  expect(root.fontSize).toBe("112.5%");
  setTextSize("xlarge");
  expect(root.getPropertyValue("--fs-base")).toBe("20px");
  expect(root.getPropertyValue("--fs-sm")).toBe("17.5px");
  setTextSize("normal");
  expect(root.getPropertyValue("--fs-base")).toBe("");
});

test("an unknown saved value falls back to normal", () => {
  localStorage.setItem(TEXT_SIZE_KEY, "huge");
  expect(getTextSize()).toBe("normal");
});

test("signing out empties storage but keeps the text size (Codex review, 2026-11-18)", () => {
  const { clearStorageKeepingTextSize, TEXT_SIZE_KEY } = require("./textSize");
  window.localStorage.setItem(TEXT_SIZE_KEY, "xlarge");
  window.localStorage.setItem("accessToken", "x");
  clearStorageKeepingTextSize();
  expect(window.localStorage.getItem("accessToken")).toBeNull();
  expect(window.localStorage.getItem(TEXT_SIZE_KEY)).toBe("xlarge");
  window.localStorage.clear();
  clearStorageKeepingTextSize();
  expect(window.localStorage.getItem(TEXT_SIZE_KEY)).toBeNull();
});
