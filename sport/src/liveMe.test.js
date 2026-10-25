import { openLiveMe, LIVE_URL } from "./liveMe";

class FakeES {
  static all = [];
  constructor(url) {
    this.url = url;
    this.closed = false;
    this.handlers = {};
    FakeES.all.push(this);
  }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  close() { this.closed = true; }
  emit(type) { this.handlers[type]?.({}); }
}

let timers;
const setTimer = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
const clearTimer = jest.fn();

beforeEach(() => { FakeES.all = []; timers = []; clearTimer.mockClear(); });
const open = (onMe) => openLiveMe(onMe, { EventSourceImpl: FakeES, setTimer, clearTimer });

test("opens the sport live stream and reloads on `me`", () => {
  const onMe = jest.fn();
  open(onMe);
  expect(FakeES.all[0].url).toBe(LIVE_URL);
  expect(LIVE_URL).toBe("/api/sport-portal/live");
  FakeES.all[0].emit("me");
  expect(onMe).toHaveBeenCalledTimes(1);
});

test("an error closes the stream and reopens it with a doubling wait, capped at 30 s", () => {
  const onMe = jest.fn();
  open(onMe);
  const waits = [];
  for (let i = 0; i < 7; i += 1) {
    FakeES.all[FakeES.all.length - 1].onerror();
    waits.push(timers[timers.length - 1].ms);
    timers[timers.length - 1].fn();
  }
  expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  expect(FakeES.all[0].closed).toBe(true);
  expect(FakeES.all).toHaveLength(8);
  expect(onMe).not.toHaveBeenCalled();
});

test("once a reopened stream is open, /me is reloaded once; the wait starts over", () => {
  const onMe = jest.fn();
  open(onMe);
  FakeES.all[0].onopen(); // first open: no reload (the page just loaded)
  expect(onMe).not.toHaveBeenCalled();
  FakeES.all[0].onerror();
  timers[0].fn();
  FakeES.all[1].onopen();
  FakeES.all[1].onopen();
  expect(onMe).toHaveBeenCalledTimes(1);
  FakeES.all[1].onerror();
  expect(timers[1].ms).toBe(1000);
});

test("closing stops the stream and any pending reopen", () => {
  const onMe = jest.fn();
  const close = open(onMe);
  FakeES.all[0].onerror();
  close();
  expect(clearTimer).toHaveBeenCalled();
  timers[0].fn();
  expect(FakeES.all).toHaveLength(1);
  const close2 = open(onMe);
  const es = FakeES.all[1];
  close2();
  expect(es.closed).toBe(true);
  es.emit("me");
  expect(onMe).not.toHaveBeenCalled();
});

test("without EventSource support it does nothing", () => {
  expect(() => openLiveMe(() => {}, { EventSourceImpl: null })()).not.toThrow();
});
