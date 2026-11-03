// Wraps an async function so overlapping calls share one in-flight promise.
// The server rotates the refresh cookie on every /auth/refresh, so two refresh
// requests at once make the second one fail with REFRESH_MISMATCH and sign the
// user out. Routing every refresh through one singleFlight prevents that.
export function singleFlight(fn) {
  let inFlight = null;
  return () => {
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(fn)
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  };
}
