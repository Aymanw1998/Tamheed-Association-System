import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import { ConfirmProvider } from "./ConfirmContext";
import { ask, cancelOpenConfirm } from "./confirmBus";
import { startDemo, stopDemo } from "../../journey/demoMode";

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(async () => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ConfirmProvider><div /></ConfirmProvider>));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  stopDemo();
  jest.restoreAllMocks();
});

const dialog = () => container.querySelector('[role="dialog"]');

// Wrapped: an async function returning the bare promise would wait for it.
async function open() {
  let answer;
  await act(async () => {
    answer = ask("delete");
  });
  expect(dialog()).not.toBeNull();
  return { answer };
}

test("stopping training mode cancels an open confirm: it answers false and closes", async () => {
  startDemo();
  const { answer } = await open();
  await act(async () => stopDemo());
  await expect(answer).resolves.toBe(false);
  expect(dialog()).toBeNull();
});

test("starting training mode cancels a confirm opened on real data", async () => {
  const { answer } = await open();
  await act(async () => startDemo());
  await expect(answer).resolves.toBe(false);
  expect(dialog()).toBeNull();
});

test("cancelOpenConfirm() cancels the open confirm, and does nothing when none is open", async () => {
  const { answer } = await open();
  await act(async () => cancelOpenConfirm());
  await expect(answer).resolves.toBe(false);
  expect(dialog()).toBeNull();
  await act(async () => cancelOpenConfirm());
  expect(dialog()).toBeNull();
});

test("the confirm button still answers true", async () => {
  const { answer } = await open();
  await act(async () => container.querySelector('[data-tour="confirm-ok"]').click());
  await expect(answer).resolves.toBe(true);
  expect(dialog()).toBeNull();
});
