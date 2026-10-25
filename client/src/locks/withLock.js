import api from "../WebServer/services/api";
import { isDemo } from "../journey/demoMode";

// A one-shot lock for a single write (the +/- stat buttons): acquire the key,
// run the write, release. A 423 from the acquire is thrown to the caller
// (handleSaveError turns it into the holder message); the write never runs.
export default async function withLock(key, run) {
  if (isDemo()) return run();
  await api.post("/locks/acquire", { key });
  try {
    return await run();
  } finally {
    api.post("/locks/release", { key }).catch(() => {});
  }
}
