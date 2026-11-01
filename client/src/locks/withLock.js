import api from "../WebServer/services/api";
import { isDemo } from "../journey/demoMode";

// A one-shot lock for a single write (the +/- stat buttons): acquire the key,
// run the write, release. A 423 from the acquire is thrown to the caller
// (handleSaveError turns it into the holder message); the write never runs.
// A lock this tab already held before (an open edit screen) is kept: only a
// lock the acquire created (`created` in its answer) is released, and the
// call finishes only once that release is done: a next write that reuses the
// lock must never have it released from under it. A failed release is ignored.
export default async function withLock(key, run) {
  if (isDemo()) return run();
  const { data } = (await api.post("/locks/acquire", { key })) || {};
  const created = data?.created !== false;
  try {
    return await run();
  } finally {
    if (created) await api.post("/locks/release", { key }).catch(() => {});
  }
}
