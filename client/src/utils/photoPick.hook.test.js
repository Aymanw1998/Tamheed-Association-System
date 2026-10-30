import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import { usePhotoPick } from "./photoPick";

global.IS_REACT_ACT_ENVIRONMENT = true;

// A file check the test finishes by hand, one per picked file.
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

let container, root, hook, setPhoto, onError, pending;

const Probe = ({ scope = "rec-1" }) => {
  hook = usePhotoPick(setPhoto, onError, { scope, prepare: (file) => pending[file].promise });
  return null;
};

beforeEach(async () => {
  setPhoto = jest.fn();
  onError = jest.fn();
  pending = { A: deferred(), B: deferred() };
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
});

afterEach(async () => {
  await act(async () => root.unmount());
});

test("sets the checked photo and is busy only while checking", async () => {
  act(() => { hook.pick("A"); });
  expect(hook.busy).toBe(true);
  await act(async () => pending.A.resolve("A-ready"));
  expect(setPhoto).toHaveBeenCalledWith("A-ready");
  expect(hook.busy).toBe(false);
});

test("a cancelled picker changes nothing", async () => {
  await act(async () => hook.pick(undefined));
  expect(hook.busy).toBe(false);
  expect(setPhoto).not.toHaveBeenCalled();
});

test("an earlier pick that finishes last does not replace the later one", async () => {
  act(() => { hook.pick("A"); });
  act(() => { hook.pick("B"); });
  await act(async () => pending.B.resolve("B-ready"));
  await act(async () => pending.A.resolve("A-ready"));
  expect(setPhoto.mock.calls).toEqual([["B-ready"]]);
  expect(hook.busy).toBe(false);
});

test("a pick finishing after the photo was removed is dropped", async () => {
  act(() => { hook.pick("A"); });
  act(() => { hook.cancel(); });
  expect(hook.busy).toBe(false);
  await act(async () => pending.A.resolve("A-ready"));
  expect(setPhoto).not.toHaveBeenCalled();
});

test("a refused photo is reported and the form keeps its photo", async () => {
  act(() => { hook.pick("A"); });
  await act(async () => pending.A.reject(new Error("too big")));
  expect(onError).toHaveBeenCalledWith("too big");
  expect(setPhoto).not.toHaveBeenCalled();
  expect(hook.busy).toBe(false);
});

test("a pick finishing after the form closed changes nothing", async () => {
  act(() => { hook.pick("A"); });
  await act(async () => root.unmount());
  pending.A.resolve("A-ready");
  await Promise.resolve();
  expect(setPhoto).not.toHaveBeenCalled();
  root = createRoot(container); // afterEach unmounts again
});

test("a pick finishing after the form moved to another record is dropped", async () => {
  act(() => { hook.pick("A"); });
  await act(async () => root.render(<Probe scope="rec-2" />));
  expect(hook.busy).toBe(false);
  await act(async () => pending.A.resolve("A-ready"));
  expect(setPhoto).not.toHaveBeenCalled();
});
