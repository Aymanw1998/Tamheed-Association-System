// The real storage listener the API module installs (Codex review,
// 2026-11-12): a logout in another tab sends a signed-in page home, but the
// wall display (/display) stays on its program and its link.
const realLocation = window.location;
let assign;

beforeAll(() => {
  assign = jest.fn();
  delete window.location;
  window.location = { pathname: "/dashboard", href: "http://localhost/dashboard", origin: "http://localhost", assign, replace: jest.fn() };
  require("./api");
});
afterAll(() => { window.location = realLocation; });
beforeEach(() => assign.mockClear());

const broadcast = () => window.dispatchEvent(new StorageEvent("storage", { key: "LOGOUT_BROADCAST", newValue: String(Date.now()) }));

test("a signed-in page goes home on another tab's logout", () => {
  window.location.pathname = "/dashboard";
  broadcast();
  expect(assign).toHaveBeenCalledWith("/");
});

test("the wall display stays where it is", () => {
  window.location.pathname = "/display";
  broadcast();
  expect(assign).not.toHaveBeenCalled();
});
