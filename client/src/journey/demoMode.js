import { useSyncExternalStore } from "react";
import { createDemoStore } from "./demoData";
import { getStoredPermissions, getStoredRole, isStoredSystem } from "../utils/session";

// Training mode: one switch, kept in memory only (never in localStorage or
// sessionStorage), so reloading the page always returns to real data.
// While it is on, the shared axios instances answer from the demo store
// (see demoAdapter.js) and the paths outside axios refuse to reach the server.
//
// The epoch changes on every start and stop; the app keys its screens on it so
// they remount and reload from the right source.

let store = null;
let epoch = 0;
const listeners = new Set();

const notify = () => {
  const on = store !== null;
  listeners.forEach((fn) => {
    try {
      fn(on);
    } catch (error) {
      console.error("demo mode listener error", error);
    }
  });
};

// Who is signed in (read only): the demo user of the same role takes this id,
// so "my lessons" filters still find something; the permissions decide what
// the demo permissions tab lets this user grant.
const signedInHint = () => {
  try {
    return {
      meId: localStorage.getItem("user_id"),
      meTz: localStorage.getItem("user_tz"),
      role: getStoredRole(),
      permissions: getStoredPermissions(),
      isSystem: isStoredSystem(),
    };
  } catch {
    return {};
  }
};

export const isDemo = () => store !== null;

export const demoEpoch = () => epoch;

export const getDemoStore = () => store;

// A fresh store on every start: nothing from an earlier session remains.
export function startDemo() {
  store = createDemoStore(signedInHint());
  epoch += 1;
  notify();
}

export function stopDemo() {
  if (store === null) return;
  store = null;
  epoch += 1;
  notify();
}

export function subscribeDemo(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Runs close() once, at the next start or stop: used by overlays added to
// document.body (outside React), so none outlives the mode it was opened in.
// Returns a cancel function (call it when the overlay closes by itself).
export function closeOnDemoToggle(close) {
  const unsubscribe = subscribeDemo(() => {
    unsubscribe();
    close();
  });
  return unsubscribe;
}

const subscribeEpoch = (onChange) => subscribeDemo(() => onChange());

export function useDemo() {
  const current = useSyncExternalStore(subscribeEpoch, demoEpoch, demoEpoch);
  return { on: isDemo(), epoch: current };
}
