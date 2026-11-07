const mockOrder = [], mockRoutes = [];
jest.mock("workbox-core", () => ({ clientsClaim: jest.fn() }));
jest.mock("workbox-precaching", () => ({
  precacheAndRoute: () => mockOrder.push("precache"),
  createHandlerBoundToURL: () => {
    if (!mockOrder.includes("precache")) throw new Error("binding before precache initialization");
    return () => "cached shell";
  },
}));
jest.mock("workbox-routing", () => ({
  NavigationRoute: class { constructor(handler, options) { this.handler = handler; this.options = options; this.navigation = true; } },
  registerRoute: (route) => { if (route.navigation) mockOrder.push("navigation"); mockRoutes.push(route); },
}));
jest.mock("workbox-strategies", () => ({ NetworkFirst: class {} }));
jest.mock("workbox-expiration", () => ({ ExpirationPlugin: class {} }));

test("fresh navigation precedes precache for root/index entries, while API/assets stay excluded", async () => {
  const events = jest.spyOn(self, "addEventListener").mockImplementation(() => {});
  const previousFetch = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
  try {
    require("../service-worker");
    expect(mockOrder).toEqual(["navigation", "precache"]);
    const navigation = mockRoutes[0];
    for (const url of ["/", "/index.html", "/index.html?release=new", "/students"]) {
      expect(navigation.options.denylist.some((pattern) => pattern.test(url))).toBe(false);
    }
    for (const url of ["/api", "/api/auth/me", "/static/js/main.old.js", "/file.pdf"]) {
      expect(navigation.options.denylist.some((pattern) => pattern.test(url))).toBe(true);
    }
    expect(await navigation.handler({ request: {} })).toBe("cached shell");
  } finally { events.mockRestore(); global.fetch = previousFetch; }
});
