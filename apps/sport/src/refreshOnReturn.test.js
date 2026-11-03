import { attachRefresh } from "./refreshOnReturn";

const setVisibility = (state) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
};

describe("attachRefresh reloads the data when the app comes back", () => {
  let clock;
  let refresh;
  let detach;

  beforeEach(() => {
    clock = 1_000_000;
    refresh = jest.fn();
    detach = attachRefresh(refresh, { minGapMs: 15000, now: () => clock });
  });

  afterEach(() => {
    detach();
    setVisibility("visible");
  });

  test("becoming visible again refreshes", () => {
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("going to the background does not refresh", () => {
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).not.toHaveBeenCalled();
  });

  test("focus and online refresh too, but not twice within the gap", () => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    expect(refresh).toHaveBeenCalledTimes(1);
    clock += 16000;
    window.dispatchEvent(new Event("online"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test("after detaching nothing refreshes", () => {
    detach();
    window.dispatchEvent(new Event("focus"));
    expect(refresh).not.toHaveBeenCalled();
  });
});
