import { freshNavigation } from "./freshNavigation";
const response = (ok = true, type = "text/html") => ({ ok, headers: { get: () => type } });
test("online entry returns current server HTML without substituting the cached shell", async () => {
  const cached = jest.fn(), latest = response(), fetcher = jest.fn().mockResolvedValue(latest);
  const context = { request: { url: "https://example.test/" } };
  expect(await freshNavigation(cached, { fetcher })(context)).toBe(latest);
  expect(fetcher).toHaveBeenCalledWith(context.request, expect.objectContaining({ cache: "no-store" }));
  expect(cached).not.toHaveBeenCalled();
});
test.each(["offline", "server failure", "non-HTML"])("%s falls back to the coherent precached shell", async (kind) => {
  const cached = jest.fn().mockResolvedValue("cached HTML");
  const fetcher = kind === "offline" ? jest.fn().mockRejectedValue(new Error("offline")) : jest.fn().mockResolvedValue(response(kind !== "server failure", kind === "non-HTML" ? "application/json" : "text/html"));
  expect(await freshNavigation(cached, { fetcher })({ request: {} })).toBe("cached HTML");
});
test("stalled navigation falls back within a bounded wait", async () => {
  jest.useFakeTimers();
  const handler = freshNavigation(() => "cached", { fetcher: () => new Promise(() => {}), timeoutMs: 4000 });
  const result = handler({ request: {} }); jest.advanceTimersByTime(4000);
  expect(await result).toBe("cached"); jest.useRealTimers();
});
