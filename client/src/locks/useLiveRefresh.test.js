import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { liveEvents } from "../WebServer/services/live/liveStream";
import useLiveRefresh from "./useLiveRefresh";

global.IS_REACT_ACT_ENVIRONMENT = true;

let root, container;
function Probe({ entities, reload }) {
  useLiveRefresh(entities, reload);
  return null;
}
const mount = async (entities, reload) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe entities={entities} reload={reload} />));
};

beforeEach(() => jest.useFakeTimers());
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
});

describe("useLiveRefresh", () => {
  test("reloads once, 300 ms after a burst of changes to a listed entity", async () => {
    const reload = jest.fn();
    await mount(["student"], reload);
    act(() => {
      liveEvents.emit("change", { entity: "student", id: "1" });
      liveEvents.emit("change", { entity: "student", id: "2" });
    });
    act(() => jest.advanceTimersByTime(299));
    expect(reload).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("ignores entities that are not listed", async () => {
    const reload = jest.fn();
    await mount(["student"], reload);
    act(() => liveEvents.emit("change", { entity: "vehicle", id: "1" }));
    act(() => jest.advanceTimersByTime(1000));
    expect(reload).not.toHaveBeenCalled();
  });

  test("reloads whenever the stream reopens", async () => {
    const reload = jest.fn();
    await mount(["student"], reload);
    act(() => liveEvents.emit("open"));
    act(() => liveEvents.emit("open"));
    expect(reload).toHaveBeenCalledTimes(2);
  });

  test("stops listening once unmounted", async () => {
    const reload = jest.fn();
    await mount(["student"], reload);
    act(() => liveEvents.emit("change", { entity: "student", id: "1" }));
    await act(async () => root.unmount());
    act(() => jest.advanceTimersByTime(1000));
    act(() => liveEvents.emit("open"));
    expect(reload).not.toHaveBeenCalled();
    root = createRoot(container); // keeps afterEach unmount valid
  });
});
