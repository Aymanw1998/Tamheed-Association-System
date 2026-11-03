// openLiveStream with injected stand-ins: no network, no real timers.
jest.mock('../api', () => ({ __esModule: true, default: { post: jest.fn() }, API_BASE_URL: '/api' }));

import { openLiveStream, backoffDelay, REFUSED_RETRY_MS } from './liveStream';
import { startDemo, stopDemo } from '../../../journey/demoMode';

function fakeEventSource() {
  const instances = [];
  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      this.closed = false;
      instances.push(this);
    }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    emit(type, data) { (this.listeners[type] || []).forEach((fn) => fn({ data: JSON.stringify(data) })); }
    close() { this.closed = true; }
  }
  return { FakeEventSource, instances };
}

function fakeTimers() {
  const pending = [];
  return {
    pending,
    setTimer: (fn, ms) => { const t = { fn, ms }; pending.push(t); return t; },
    clearTimer: (t) => { const i = pending.indexOf(t); if (i >= 0) pending.splice(i, 1); },
    runNext: async () => { const t = pending.shift(); await t.fn(); return t.ms; },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('opens the stream with a fresh ticket and routes storage and alert events', async () => {
  const { FakeEventSource, instances } = fakeEventSource();
  const onStorage = jest.fn();
  const onAlert = jest.fn();
  const close = openLiveStream({
    onStorage, onAlert,
    deps: { requestTicket: async () => 'tk/1', EventSourceImpl: FakeEventSource, ...fakeTimers() },
  });
  await flush();
  expect(instances).toHaveLength(1);
  expect(instances[0].url).toBe('/api/live/stream?ticket=tk%2F1');
  instances[0].emit('storage', { action: 'file_renamed' });
  instances[0].emit('alert', { id: 'a1' });
  expect(onStorage).toHaveBeenCalledWith({ action: 'file_renamed' });
  expect(onAlert).toHaveBeenCalledWith({ id: 'a1' });
  close();
  expect(instances[0].closed).toBe(true);
});

test('every reconnect asks for a new ticket, with growing backoff that resets once open', async () => {
  const { FakeEventSource, instances } = fakeEventSource();
  const timers = fakeTimers();
  let n = 0;
  const requestTicket = jest.fn(async () => `t${++n}`);
  const close = openLiveStream({ deps: { requestTicket, EventSourceImpl: FakeEventSource, ...timers } });
  await flush();

  instances[0].onerror();
  expect(instances[0].closed).toBe(true);
  expect(await timers.runNext()).toBe(backoffDelay(0));
  instances[1].onerror();
  expect(await timers.runNext()).toBe(backoffDelay(1));
  expect(backoffDelay(1)).toBeGreaterThan(backoffDelay(0));
  expect(instances.map((es) => es.url)).toEqual([
    '/api/live/stream?ticket=t1', '/api/live/stream?ticket=t2', '/api/live/stream?ticket=t3',
  ]);

  instances[2].onopen();
  instances[2].onerror();
  expect(timers.pending[0].ms).toBe(backoffDelay(0));
  close();
  expect(timers.pending).toHaveLength(0);
  expect(requestTicket).toHaveBeenCalledTimes(3);
});

test.each([401, 423])('a %i ticket answer waits the long refusal delay instead of retrying quickly', async (status) => {
  const { FakeEventSource, instances } = fakeEventSource();
  const timers = fakeTimers();
  const refused = Object.assign(new Error('refused'), { response: { status } });
  const requestTicket = jest.fn().mockRejectedValue(refused);
  const close = openLiveStream({ deps: { requestTicket, EventSourceImpl: FakeEventSource, ...timers } });
  await flush();
  expect(instances).toHaveLength(0);
  expect(timers.pending.map((t) => t.ms)).toEqual([REFUSED_RETRY_MS]);
  expect(REFUSED_RETRY_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
  close();
});

test('a failed ticket request retries later; nothing opens after close', async () => {
  const { FakeEventSource, instances } = fakeEventSource();
  const timers = fakeTimers();
  const requestTicket = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('t2');
  const close = openLiveStream({ deps: { requestTicket, EventSourceImpl: FakeEventSource, ...timers } });
  await flush();
  expect(instances).toHaveLength(0);
  expect(timers.pending).toHaveLength(1);
  close();
  expect(timers.pending).toHaveLength(0);
  expect(backoffDelay(50)).toBeLessThanOrEqual(30000);
});

test('onOpen runs each time the stream (re)opens, so the caller can reload what it missed', async () => {
  const { FakeEventSource, instances } = fakeEventSource();
  const timers = fakeTimers();
  const onOpen = jest.fn();
  const close = openLiveStream({ onOpen, deps: { requestTicket: async () => 't', EventSourceImpl: FakeEventSource, ...timers } });
  await flush();
  expect(onOpen).not.toHaveBeenCalled();
  instances[0].onopen();
  expect(onOpen).toHaveBeenCalledTimes(1);
  instances[0].onerror();
  await timers.runNext();
  instances[1].onopen();
  expect(onOpen).toHaveBeenCalledTimes(2);
  close();
});

test('no connection in demo, and it reconnects when demo ends', async () => {
  const { FakeEventSource, instances } = fakeEventSource();
  const timers = fakeTimers();
  const requestTicket = jest.fn(async () => 't');
  startDemo();
  try {
    const close = openLiveStream({ deps: { requestTicket, EventSourceImpl: FakeEventSource, ...timers } });
    await flush();
    expect(requestTicket).not.toHaveBeenCalled();
    expect(instances).toHaveLength(0);
    stopDemo();
    await flush();
    expect(instances).toHaveLength(1);
    close();
  } finally {
    stopDemo();
  }
});

test('an open stream closes when demo turns on', async () => {
  const { FakeEventSource, instances } = fakeEventSource();
  const timers = fakeTimers();
  const close = openLiveStream({ deps: { requestTicket: async () => 't', EventSourceImpl: FakeEventSource, ...timers } });
  await flush();
  expect(instances).toHaveLength(1);
  startDemo();
  try {
    expect(instances[0].closed).toBe(true);
    expect(timers.pending).toHaveLength(0);
  } finally {
    stopDemo();
    close();
  }
});
