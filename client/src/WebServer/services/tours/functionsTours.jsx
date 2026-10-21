import api from "../api";

// The signed-in user's own product-tour state (server/routes/tours.routes.js).
// Loading answers null on any error, and saves never throw: the app works the
// same with tours off. Each kind of failed save is logged once per page load.

const logged = new Set();
const logOnce = (name, error) => {
  if (logged.has(name)) return;
  logged.add(name);
  console.warn(`tours: ${name} failed`, error?.response?.status || error?.message || "");
};

const strings = (value) => (Array.isArray(value) ? value.filter((x) => typeof x === "string") : []);

export async function loadTourState() {
  try {
    const { data } = await api.get("/tours");
    if (!data?.ok) return null;
    const tours = data.tours && typeof data.tours === "object" && !Array.isArray(data.tours) ? data.tours : {};
    return {
      tours,
      knownKeys: Array.isArray(data.knownKeys) ? strings(data.knownKeys) : null,
      seenReleases: strings(data.seenReleases),
    };
  } catch (error) {
    logOnce("load", error);
    return null;
  }
}

export async function saveTour(id, status, version) {
  try {
    await api.post(`/tours/item/${encodeURIComponent(id)}`, { status, version });
  } catch (error) {
    logOnce("saveTour", error);
  }
}

export async function saveKnownKeys(keys) {
  try {
    await api.post("/tours/known-keys", { keys: strings(keys) });
  } catch (error) {
    logOnce("saveKnownKeys", error);
  }
}

// The server takes at most 50 ids per call.
export async function saveSeenReleases(ids) {
  const list = strings(ids);
  try {
    for (let i = 0; i < list.length; i += 50) {
      await api.post("/tours/releases/seen", { ids: list.slice(i, i + 50) });
    }
  } catch (error) {
    logOnce("saveSeenReleases", error);
  }
}

// Clears another user's tours so they see them again at their next sign-in.
export async function resetUserTours(tz) {
  try {
    const { data } = await api.post(`/tours/reset/${encodeURIComponent(tz)}`);
    return { ok: Boolean(data?.ok) };
  } catch (error) {
    logOnce("reset", error);
    return { ok: false };
  }
}
