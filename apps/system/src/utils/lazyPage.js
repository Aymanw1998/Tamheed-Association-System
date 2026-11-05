import { lazy } from "react";

const RELOAD_KEY = "lazyPageReloadedBuild";

const currentBuild = () => document.querySelector('script[src*="/static/js/main"]')?.getAttribute("src") || "unknown";

// A page's file is loaded when the page opens. After a deploy an open tab may ask
// for a file that is gone: reload to get the new build. Once per build: if the
// reload brought the same build back, the problem is not a new build (a file that
// keeps failing on a bad connection), and another reload would loop forever.
export const reloadOnceForNewBuild = (store = window.sessionStorage, reload = () => window.location.reload(), build = currentBuild()) => {
  try {
    if (store.getItem(RELOAD_KEY) === build) return false;
    store.setItem(RELOAD_KEY, build);
  } catch {
    return false;
  }
  reload();
  return true;
};

export const lazyPage = (load) => lazy(() => load().catch((error) => {
  if (reloadOnceForNewBuild()) return new Promise(() => {}); // the page is going away
  throw error;
}));
