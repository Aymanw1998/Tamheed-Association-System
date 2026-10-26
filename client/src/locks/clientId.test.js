const load = () => {
  let mod;
  jest.isolateModules(() => { mod = require("./clientId"); });
  return mod;
};

beforeEach(() => {
  sessionStorage.clear();
  window.name = "";
});

test("a reload of the same tab keeps its id (window.name still names it)", () => {
  const first = load().getClientId();
  expect(load().getClientId()).toBe(first);
});

test("a duplicated tab (sessionStorage copied, window.name empty) mints a new id", () => {
  const first = load().getClientId();
  window.name = "";
  const second = load().getClientId();
  expect(second).not.toBe(first);
  expect(sessionStorage.getItem("tamheed-client-id")).toBe(second);
});

function fakeChannels() {
  const all = [];
  const make = () => {
    const ch = {
      onmessage: null,
      postMessage(data) { all.filter((o) => o !== ch && !o.closed).forEach((o) => o.onmessage && o.onmessage({ data })); },
      close() { ch.closed = true; },
    };
    all.push(ch);
    return ch;
  };
  return make;
}

test("a tab whose id another open tab already uses mints a new id (BroadcastChannel handshake)", () => {
  const make = fakeChannels();
  const original = load();
  const id = original.getClientId();
  const stopA = original.startClientIdGuard({ makeChannel: make });
  // A duplicated tab got the same id, and the per-load check missed it.
  const copy = load();
  expect(copy.getClientId()).toBe(id);
  const stopB = copy.startClientIdGuard({ makeChannel: make });
  expect(copy.getClientId()).not.toBe(id);
  stopA();
  stopB();
});

test("a lone tab keeps its id after the handshake", () => {
  const make = fakeChannels();
  const mod = load();
  const id = mod.getClientId();
  const stop = mod.startClientIdGuard({ makeChannel: make });
  expect(mod.getClientId()).toBe(id);
  stop();
});
