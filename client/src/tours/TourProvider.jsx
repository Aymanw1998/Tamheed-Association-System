import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useI18n } from "../i18n/I18nContext";
import { getStoredPermissions, getStoredUserId } from "../utils/session";
import { canAccessPath } from "../utils/routeAccess";
import { confirmLeave } from "../utils/unsavedChanges";
import {
  loadTourState, saveKnownKeys, saveSeenReleases, saveTour,
} from "../WebServer/services/tours/functionsTours";
import {
  can, helpReleases, newAccess, sectionOfPath, startupQueue, tourForPath, tourPath,
  isTypingTarget, unknownSectionKeys, unseenReleases, usableSteps, usableStepsByTab, tourTabs,
  tabEvent, waitWhile,
} from "./logic";
import { TOURS } from "./registry";
import { RELEASES } from "./releases";
import { SECTIONS } from "./sections";
import { runTour, tourSelector } from "./runTour";
import { AccessPrompt, HelpCenter, WhatsNewModal } from "./HelpCenter";
import styles from "./Tours.module.css";

// Decides which tour, prompt or "what's new" to show, and runs it.
// - Loads the user's tour state once; if that fails nothing tour-related renders.
// - Sign-in queue, one at a time: welcome tour -> new-access card -> "what's new".
// - A screen's tour starts on the first visit (when nothing else is showing).
// - "Later" is remembered for this browser tab only (sessionStorage), so the next
//   sign-in in a new tab shows it again; "done"/"skipped" are saved on the server.

const DEFER_KEY = "tamheed_tours_deferred";
const WAIT_MS = 5000;
const POLL_MS = 250;

const NOOP = { startTour: () => {}, openHelp: () => {}, openWhatsNew: () => {}, state: null, newSections: [] };
const TourContext = createContext(NOOP);

// Deferred ids belong to the user who deferred them.
const readDeferred = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DEFER_KEY) || "null");
    if (!saved || saved.user !== getStoredUserId() || !Array.isArray(saved.ids)) return new Set();
    return new Set(saved.ids.filter((id) => typeof id === "string"));
  } catch {
    return new Set();
  }
};

const writeDeferred = (ids) => {
  try {
    sessionStorage.setItem(DEFER_KEY, JSON.stringify({ user: getStoredUserId(), ids: [...ids] }));
  } catch {}
};

const TAB_PROBE_MS = 250;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const modalOpen = () => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));

const findTarget = (target) => {
  try {
    return document.querySelector(tourSelector(target));
  } catch {
    return null;
  }
};

// A target exists when it is on screen; a menu step's target may sit in the
// closed side menu (runTour opens it first), so being in the page is enough.
const existsFor = (tour) => (target) => {
  const el = findTarget(target);
  if (!el) return false;
  const menu = tour.steps.some((s) => s.target === target && s.menu);
  return menu || el.getClientRects().length > 0;
};

// Waits (up to WAIT_MS) for the first permitted targeted step, then keeps the usable steps.
async function prepareSteps(tour, permissions, cancelled) {
  const exists = existsFor(tour);
  const first = tour.steps.find((s) => s.target && can(permissions, s.requires ?? null));
  const started = Date.now();
  while (first && !exists(first.target) && Date.now() - started < WAIT_MS) {
    await sleep(POLL_MS);
    if (cancelled()) return null;
  }
  if (cancelled()) return null;
  const tabs = tourTabs(tour);
  if (!tabs.length) return usableSteps(tour, { permissions, exists });
  // Tabs: open each one in turn and note which targets are really there.
  const seen = (tab) => new Set(tour.steps.filter((x) => (x.tab || "") === tab && x.target && exists(x.target)).map((x) => x.target));
  const found = { "": seen("") };
  // If a tab step is already on screen the panel was open: leave it as it was.
  const wasOpen = tour.steps.some((x) => x.tab && x.target && exists(x.target));
  try {
    for (const tab of tabs) {
      window.dispatchEvent(new CustomEvent("tamheed:tour-tab", { detail: tabEvent(tour, tab) }));
      await sleep(TAB_PROBE_MS);
      if (cancelled()) return null;
      found[tab] = seen(tab);
    }
  } finally {
    if (!wasOpen) window.dispatchEvent(new CustomEvent("tamheed:tour-tab", { detail: tabEvent(tour, null) }));
  }
  return usableStepsByTab(tour, { permissions, found });
}

// The tour leaves the page only as the menu would: an edit page with unsaved
// edits asks first. A confirm that is not ready yet counts as "stay".
const leaveOk = async () => {
  try {
    return await confirmLeave(window.location.pathname);
  } catch {
    return false;
  }
};

const samePath = (a, b) => String(a || "").replace(/\/+$/, "") === String(b || "").replace(/\/+$/, "");

export function TourProvider({ children }) {
  const { language, dir, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  const [phase, setPhase] = useState("loading"); // loading | off | ready
  const [state, setState] = useState(null);
  const [queue, setQueue] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [startup, setStartup] = useState({ access: { sections: [], abilities: [] }, releases: [] });

  const stateRef = useRef(null);
  stateRef.current = state;
  const deferredRef = useRef(null);
  if (deferredRef.current === null) deferredRef.current = readDeferred();
  const stopRef = useRef(null);
  const launchRef = useRef(0);
  const pendingRef = useRef(null);
  const triedPathRef = useRef(null);
  const prevPathRef = useRef(pathname);
  const textRef = useRef({ language, dir, t });
  textRef.current = { language, dir, t };

  // ---------- load + seed ----------
  useEffect(() => {
    let alive = true;
    loadTourState().then((loaded) => {
      if (!alive) return;
      if (!loaded) {
        setPhase("off");
        return;
      }
      const permissions = getStoredPermissions();
      const deferred = deferredRef.current;
      let next = loaded;
      // First run after deploy: remember what the user has now, silently. A
      // session without stored permissions yet is not seeded (it would make
      // every section look new next time).
      if (loaded.knownKeys == null && permissions.length) {
        const ids = RELEASES.map((r) => r.id);
        saveKnownKeys(permissions);
        saveSeenReleases(ids);
        next = { ...loaded, knownKeys: [...permissions].sort(), seenReleases: [...new Set([...loaded.seenReleases, ...ids])] };
      }
      setStartup({
        access: newAccess(loaded.knownKeys, permissions),
        releases: unseenReleases(loaded.seenReleases, permissions),
      });
      setQueue(startupQueue({ state: loaded, permissions, deferred }));
      setState(next);
      setPhase("ready");
    });
    return () => {
      alive = false;
    };
  }, []);

  // ---------- running tours ----------
  const cancel = useCallback(() => {
    launchRef.current += 1;
    const stop = stopRef.current;
    stopRef.current = null;
    if (stop) stop();
    setActiveId(null);
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  const popQueue = useCallback(() => setQueue((q) => q.slice(1)), []);

  const defer = useCallback((id) => {
    deferredRef.current.add(id);
    writeDeferred(deferredRef.current);
  }, []);

  const record = useCallback((tour, status) => {
    saveTour(tour.id, status, tour.version);
    setState((s) => (s ? { ...s, tours: { ...s.tours, [tour.id]: { status, version: tour.version } } } : s));
  }, []);

  // auto: a screen tour started by visiting; it gives way to a dialog opened meanwhile.
  // Automatic starts (auto, fromQueue) wait while the user is typing in a field:
  // driver.js moves focus into its popover, which would steal it.
  const launch = useCallback(async (tour, { fromQueue = false, auto = false } = {}) => {
    cancel();
    const token = launchRef.current;
    const cancelled = () => token !== launchRef.current;
    let ended = false;
    // Ends a launch that shows nothing (no steps, gave way, or failed): frees the queue.
    const giveUp = () => {
      if (ended) return;
      ended = true;
      stopRef.current = null;
      setActiveId(null);
      if (fromQueue) popQueue();
    };
    setActiveId(tour.id);
    try {
      const permissions = getStoredPermissions();
      const typing = () => (auto || fromQueue) && isTypingTarget(document.activeElement);
      let steps = null;
      // Wait for typing to end before probing (probing opens panels and tabs),
      // and again if the user started typing while the steps were prepared.
      do {
        if (typing()) {
          const idle = await waitWhile(typing, { pause: () => sleep(POLL_MS), cancelled });
          if (!idle || cancelled()) return;
          // Things may have changed while waiting: check again.
          if (auto && (stateRef.current?.tours?.[tour.id] || deferredRef.current.has(tour.id))) {
            giveUp();
            return;
          }
        }
        steps = await prepareSteps(tour, permissions, cancelled);
        if (cancelled()) return;
      } while (typing());
      if (!steps || !steps.length || (auto && modalOpen())) {
        giveUp();
        return;
      }
      const { language: lang, dir: textDir, t: tr } = textRef.current;
      const stop = runTour({ ...tour, steps }, {
        language: lang,
        dir: textDir,
        t: tr,
        onFinish: (status) => {
          if (ended) return;
          ended = true;
          stopRef.current = null;
          setActiveId(null);
          if (status === "later") defer(tour.id);
          else record(tour, status);
          if (fromQueue) popQueue();
        },
        onError: giveUp,
      });
      if (!ended && !cancelled()) stopRef.current = stop;
      else if (cancelled()) stop();
    } catch (error) {
      console.warn("tours: could not start the tour", error?.message || error);
      if (!cancelled()) giveUp();
    }
  }, [cancel, defer, popQueue, record]);

  // Starts a tour by id, going to its page first when it lives elsewhere.
  // Leaving an edit page with unsaved edits asks first; "stay" starts nothing.
  const startTour = useCallback(async (id) => {
    if (phase !== "ready") return;
    const tour = TOURS.find((x) => x.id === id);
    const permissions = getStoredPermissions();
    if (!tour || !can(permissions, tour.requires ?? null)) return;
    setHelpOpen(false);
    setWhatsNewOpen(false);
    if (tour.route && !tour.route.test(pathname)) {
      const path = tourPath(id);
      if (!path || !canAccessPath(path, permissions)) return;
      if (!(await leaveOk())) return;
      pendingRef.current = { id, path };
      navigate(path);
      return;
    }
    launch(tour);
  }, [phase, pathname, navigate, launch]);

  // ---------- navigation ----------
  useEffect(() => {
    if (samePath(prevPathRef.current, pathname)) return;
    prevPathRef.current = pathname;
    triedPathRef.current = null;
    // A tour waiting for its page whose navigation ended elsewhere (a guard
    // redirected, or the user moved on) is dropped, so screen tours keep working.
    if (pendingRef.current && !samePath(pendingRef.current.path, pathname)) pendingRef.current = null;
    // Left the page (browser back): stop quietly; a sign-in item comes back on its own.
    if (stopRef.current || activeId) cancel();
  }, [pathname, activeId, cancel]);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || phase !== "ready" || !samePath(pending.path, pathname)) return;
    pendingRef.current = null;
    triedPathRef.current = pathname;
    const tour = TOURS.find((x) => x.id === pending.id);
    if (tour) launch(tour);
  }, [pathname, phase, launch]);

  // Visiting a section marks its keys as known (ends its "new" state).
  useEffect(() => {
    if (phase !== "ready") return;
    const keys = unknownSectionKeys(sectionOfPath(pathname), getStoredPermissions(), stateRef.current?.knownKeys);
    if (!keys.length) return;
    saveKnownKeys(keys);
    setState((s) => (s && s.knownKeys ? { ...s, knownKeys: [...new Set([...s.knownKeys, ...keys])].sort() } : s));
  }, [pathname, phase]);

  // ---------- sign-in queue ----------
  const head = phase === "ready" ? queue[0] || null : null;

  useEffect(() => {
    if (head !== "welcome" || activeId) return;
    const tour = TOURS.find((x) => x.id === "welcome");
    if (!tour) {
      popQueue();
      return;
    }
    launch(tour, { fromQueue: true });
  }, [head, activeId, launch, popQueue]);

  // Nothing to show for this item (should not happen): move on.
  useEffect(() => {
    const empty = (head === "access" && !startup.access.sections.length && !startup.access.abilities.length)
      || (head === "releases" && !startup.releases.length);
    if (empty) popQueue();
  }, [head, startup, popQueue]);

  // ---------- screen tour on first visit ----------
  useEffect(() => {
    if (phase !== "ready" || head || activeId || helpOpen || whatsNewOpen || pendingRef.current) return;
    if (triedPathRef.current === pathname) return;
    const tour = tourForPath(pathname);
    if (!tour || stateRef.current?.tours?.[tour.id] || deferredRef.current.has(tour.id)) return;
    if (!can(getStoredPermissions(), tour.requires ?? null) || modalOpen()) return;
    triedPathRef.current = pathname;
    launch(tour, { auto: true });
  }, [phase, head, activeId, helpOpen, whatsNewOpen, pathname, launch]);

  // ---------- "what's new" ----------
  const markSeen = useCallback((releases) => {
    const seen = new Set(stateRef.current?.seenReleases || []);
    const ids = releases.map((r) => r.id).filter((id) => !seen.has(id));
    if (!ids.length) return;
    saveSeenReleases(ids);
    setState((s) => (s ? { ...s, seenReleases: [...(s.seenReleases || []), ...ids] } : s));
  }, []);

  const permissions = getStoredPermissions();
  const manualReleases = whatsNewOpen ? helpReleases(state?.seenReleases, permissions) : [];
  const startupReleasesOpen = head === "releases" && !activeId;

  const closeWhatsNew = useCallback((fromStartup, releases) => {
    markSeen(releases);
    if (fromStartup) popQueue();
    else setWhatsNewOpen(false);
  }, [markSeen, popQueue]);

  const showRelease = (fromStartup, releases, release) => {
    closeWhatsNew(fromStartup, releases);
    startTour(release.tourId);
  };

  // ---------- new-access card ----------
  const accessOpen = head === "access" && !activeId;

  const showAccess = async (item) => {
    popQueue();
    const section = SECTIONS[item.section];
    if (!section) return;
    if (item.kind === "ability" && section.tourId && TOURS.some((x) => x.id === section.tourId)) {
      startTour(section.tourId);
      return;
    }
    if (await leaveOk()) navigate(section.path);
  };

  const laterAccess = () => {
    defer("access");
    popQueue();
  };

  const openHelp = useCallback(() => {
    if (phase === "ready") setHelpOpen(true);
  }, [phase]);

  const openWhatsNew = useCallback(() => {
    if (phase !== "ready") return;
    setHelpOpen(false);
    setWhatsNewOpen(true);
  }, [phase]);

  // Sections opened to the user and not visited yet (the menu's "new" badges).
  const newSections = useMemo(
    () => (state ? newAccess(state.knownKeys ?? null, getStoredPermissions()).sections : []),
    [state],
  );

  const value = useMemo(
    () => (phase === "ready" ? { startTour, openHelp, openWhatsNew, state, newSections } : NOOP),
    [phase, startTour, openHelp, openWhatsNew, state, newSections],
  );

  if (phase !== "ready") {
    return <TourContext.Provider value={NOOP}>{children}</TourContext.Provider>;
  }

  return (
    <TourContext.Provider value={value}>
      {children}
      <button
        type="button"
        data-tour="help-button"
        className={styles.helpButton}
        onClick={openHelp}
        aria-label={t("tour.help.button")}
        title={t("tour.help.button")}
      >
        ?
      </button>

      {helpOpen && (
        <HelpCenter
          pathname={pathname}
          permissions={permissions}
          tours={state?.tours}
          onClose={() => setHelpOpen(false)}
          onStart={startTour}
          onWhatsNew={openWhatsNew}
        />
      )}

      {whatsNewOpen && (
        <WhatsNewModal
          releases={manualReleases}
          seen={state?.seenReleases}
          permissions={permissions}
          onClose={() => closeWhatsNew(false, manualReleases)}
          onShow={(release) => showRelease(false, manualReleases, release)}
        />
      )}

      {startupReleasesOpen && !whatsNewOpen && (
        <WhatsNewModal
          releases={startup.releases}
          seen={state?.seenReleases}
          permissions={permissions}
          onClose={() => closeWhatsNew(true, startup.releases)}
          onShow={(release) => showRelease(true, startup.releases, release)}
        />
      )}

      {accessOpen && (startup.access.sections.length > 0 || startup.access.abilities.length > 0) && (
        <AccessPrompt
          sections={startup.access.sections}
          abilities={startup.access.abilities}
          onShow={showAccess}
          onLater={laterAccess}
        />
      )}
    </TourContext.Provider>
  );
}

export const useTour = () => useContext(TourContext);
