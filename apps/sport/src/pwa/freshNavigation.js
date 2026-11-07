// Return current HTML when online, retaining the coherent precached app shell
// when offline. Never cache fresh HTML under an older worker's revision.
export function freshNavigation(fallback, { fetcher = (...args) => fetch(...args), timeoutMs = 4000 } = {}) {
  return async (context) => {
    const controller = new AbortController();
    let timer;
    try {
      const response = await Promise.race([
        fetcher(context.request, { cache: "no-store", signal: controller.signal }),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("navigation timeout")); }, timeoutMs); }),
      ]);
      if (response.ok && String(response.headers.get("Content-Type") || "").includes("text/html")) return response;
    } catch {}
    finally { clearTimeout(timer); }
    return fallback(context);
  };
}
