import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useI18n } from "../i18n/I18nContext";
import { useJourney } from "../journey/JourneyProvider";
import { CHAPTERS } from "../journey/chapters";
import { availableChapters, INTRO_ID, screenChapter } from "../journey/journeyLogic";
import { isDemo } from "../journey/demoMode";
import { getStoredPermissions, getStoredUserId } from "../utils/session";
import { canAccessPath } from "../utils/routeAccess";
import { confirmLeave } from "../utils/unsavedChanges";
import {
  loadTourState, saveKnownKeys, saveSeenReleases,
} from "../WebServer/services/tours/functionsTours";
import {
  helpReleases, newAccess, releaseShowMe, sectionChapter, sectionOfPath, startupQueue,
  unknownSectionKeys, unseenReleases,
} from "./logic";
import { RELEASES } from "./releases";
import { SECTIONS } from "./sections";
import { AccessPrompt, HelpCenter, WhatsNewModal } from "./HelpCenter";
import styles from "./Tours.module.css";

// The "?" help center, the new-access card, "what's new" and the menu's "new"
// badges. Every «أرني» or «ابدأ» runs the guided journey (JourneyProvider must
// wrap this provider); the old screen tours are gone.
// - Loads the user's tour state once; if that fails nothing here renders.
// - Sign-in order, one at a time: the journey's offer (JourneyProvider) ->
//   new-access card -> "what's new". Nothing here shows until the journey has
//   decided on its offer, while its card is up, or while the journey runs.
// - "Later" on the access card is remembered for this browser tab only
//   (sessionStorage), so the next sign-in in a new tab shows it again.

const DEFER_KEY = "tamheed_tours_deferred";

const NOOP = { openHelp: () => {}, openWhatsNew: () => {}, state: null, newSections: [] };
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

// Leaving an edit page with unsaved edits asks first. A confirm that is not
// ready yet counts as "stay".
const leaveOk = async () => {
  try {
    return await confirmLeave(window.location.pathname);
  } catch {
    return false;
  }
};

export function TourProvider({ children }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const journey = useJourney();
  const { offer, startJourney, running, settled, offering, offerAnswered } = journey;

  const [phase, setPhase] = useState("loading"); // loading | off | ready
  const [state, setState] = useState(null);
  const [queue, setQueue] = useState([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [startup, setStartup] = useState({ access: { sections: [], abilities: [] }, releases: [] });

  const stateRef = useRef(null);
  stateRef.current = state;
  const deferredRef = useRef(null);
  if (deferredRef.current === null) deferredRef.current = readDeferred();

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
      setQueue(startupQueue({ state: loaded, permissions, deferred: deferredRef.current }));
      setState(next);
      setPhase("ready");
    });
    return () => {
      alive = false;
    };
  }, []);

  const popQueue = useCallback(() => setQueue((q) => q.slice(1)), []);

  // Visiting a section marks its keys as known (ends its "new" state). Pages
  // the journey opens in training mode do not count.
  useEffect(() => {
    if (phase !== "ready" || isDemo()) return;
    const keys = unknownSectionKeys(sectionOfPath(pathname), getStoredPermissions(), stateRef.current?.knownKeys);
    if (!keys.length) return;
    saveKnownKeys(keys);
    setState((s) => (s && s.knownKeys ? { ...s, knownKeys: [...new Set([...s.knownKeys, ...keys])].sort() } : s));
  }, [pathname, phase]);

  // ---------- the journey ----------
  const permissions = getStoredPermissions();
  const chapters = availableChapters(CHAPTERS, permissions);

  // Runs one chapter, or (only: false) the journey from that chapter on.
  const runChapter = useCallback((chapterId, only) => {
    setHelpOpen(false);
    setWhatsNewOpen(false);
    return startJourney(chapterId, { only });
  }, [startJourney]);

  // The whole journey: the guide's own card when it has something to say
  // («نكمل من فصل X؟», or its first introduction), otherwise from the start.
  const runFullJourney = () => {
    setHelpOpen(false);
    setWhatsNewOpen(false);
    if (offer()) return;
    if (chapters.length) startJourney(chapters[0].id);
  };

  // While the journey runs, nothing here stays open.
  useEffect(() => {
    if (!running) return;
    setHelpOpen(false);
    setWhatsNewOpen(false);
  }, [running]);

  // ---------- sign-in queue ----------
  const journeyQuiet = settled && !offering && !running;
  const head = phase === "ready" && journeyQuiet ? queue[0] || null : null;

  // Nothing to show for this item (should not happen): move on.
  useEffect(() => {
    const empty = (head === "access" && !startup.access.sections.length && !startup.access.abilities.length)
      || (head === "releases" && !startup.releases.length);
    if (empty) popQueue();
  }, [head, startup, popQueue]);

  // ---------- "what's new" ----------
  const markSeen = useCallback((releases) => {
    const seen = new Set(stateRef.current?.seenReleases || []);
    const ids = releases.map((r) => r.id).filter((id) => !seen.has(id));
    if (!ids.length) return;
    saveSeenReleases(ids);
    setState((s) => (s ? { ...s, seenReleases: [...(s.seenReleases || []), ...ids] } : s));
  }, []);

  // Once the journey's offer card is answered (start, later or skip), the
  // journey's own release counts as seen: "what's new" must not offer it next.
  useEffect(() => {
    if (phase !== "ready" || !offerAnswered) return;
    const intro = RELEASES.filter((r) => r.tourId === INTRO_ID);
    if (!intro.length) return;
    markSeen(intro);
    setStartup((s) => ({ ...s, releases: s.releases.filter((r) => r.tourId !== INTRO_ID) }));
  }, [phase, offerAnswered, markSeen]);

  const manualReleases = whatsNewOpen ? helpReleases(state?.seenReleases, permissions) : [];
  const startupReleasesOpen = head === "releases";

  const closeWhatsNew = useCallback((fromStartup, releases) => {
    markSeen(releases);
    if (fromStartup) popQueue();
    else setWhatsNewOpen(false);
  }, [markSeen, popQueue]);

  // «أرني» shows only for a release whose chapter this user has.
  const canShow = (release) => {
    const show = releaseShowMe(release);
    return Boolean(show && chapters.some((c) => c.id === show.chapterId));
  };

  const showRelease = (fromStartup, releases, release) => {
    closeWhatsNew(fromStartup, releases);
    const show = releaseShowMe(release);
    if (show) runChapter(show.chapterId, show.only);
  };

  // ---------- new-access card ----------
  const accessOpen = head === "access";

  // «أرني» runs the section's chapter alone; a section without one opens its page.
  const showAccess = async (item) => {
    popQueue();
    const chapterId = sectionChapter(item.section);
    if (chapterId && chapters.some((c) => c.id === chapterId)) {
      runChapter(chapterId, true);
      return;
    }
    const section = SECTIONS[item.section];
    if (section && (await leaveOk())) navigate(section.path);
  };

  const laterAccess = () => {
    deferredRef.current.add("access");
    writeDeferred(deferredRef.current);
    popQueue();
  };

  const openHelp = useCallback(() => {
    if (phase === "ready" && !running) setHelpOpen(true);
  }, [phase, running]);

  const openWhatsNew = useCallback(() => {
    if (phase !== "ready" || running) return;
    setHelpOpen(false);
    setWhatsNewOpen(true);
  }, [phase, running]);

  // Sections opened to the user and not visited yet (the menu's "new" badges).
  const newSections = useMemo(
    () => (state ? newAccess(state.knownKeys ?? null, getStoredPermissions()).sections : []),
    [state],
  );

  const value = useMemo(
    () => (phase === "ready" ? { openHelp, openWhatsNew, state, newSections } : NOOP),
    [phase, openHelp, openWhatsNew, state, newSections],
  );

  if (phase !== "ready") {
    return <TourContext.Provider value={NOOP}>{children}</TourContext.Provider>;
  }

  // The help center lists the chapters whose page this user can open.
  const helpChapters = chapters.filter((c) => canAccessPath(c.route, permissions));

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
          chapters={helpChapters}
          screen={screenChapter(helpChapters, pathname)}
          tours={journey.tours}
          onClose={() => setHelpOpen(false)}
          onFullJourney={runFullJourney}
          onChapter={(id) => runChapter(id, true)}
          onWhatsNew={openWhatsNew}
        />
      )}

      {whatsNewOpen && (
        <WhatsNewModal
          releases={manualReleases}
          seen={state?.seenReleases}
          canShow={canShow}
          onClose={() => closeWhatsNew(false, manualReleases)}
          onShow={(release) => showRelease(false, manualReleases, release)}
        />
      )}

      {startupReleasesOpen && !whatsNewOpen && (
        <WhatsNewModal
          releases={startup.releases}
          seen={state?.seenReleases}
          canShow={canShow}
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
