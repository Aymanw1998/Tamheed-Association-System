import React, { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { GUIDE_NAMES, guideFor } from "./guideNames";
import { startDemo, stopDemo, useDemo } from "./demoMode";
import { availableChapters, INTRO_ID, journeyOffer, nextChapter } from "./journeyLogic";
import { isJourneyEvent, runAction, TARGET_MISSING } from "./actions";
import { CHAPTERS } from "./chapters";
import { isTypingTarget, waitWhile } from "../tours/logic";
import { confirmLeave } from "../utils/unsavedChanges";
import { getStoredGender, getStoredPermissions, getStoredUserId } from "../utils/session";
import { loadTourState, saveTour } from "../WebServer/services/tours/functionsTours";
import styles from "./Journey.module.css";

// Runs the guided journey: chapters of steps shown by the guide character, on
// demo data (training mode), with the guide acting on the page itself.
//
// - Start: confirmLeave() (unsaved edits), then startDemo(), then the chapter's
//   route; the screens remount on demo data.
// - «التالي» runs the step's action (actions.js), then shows the next step. A
//   step whose target does not show within TARGET_WAIT_MS is skipped, and so
//   is an action whose target is missing.
// - A chapter's end shows a celebrate step and saves it as done; «تخطّي الفصل»
//   saves it as skipped. Each chapter is its own tour id on the server.
// - Pause or end: stopDemo(), then /dashboard (the screens remount on real data).
// - While it runs, real clicks and Enter/Space on the page are swallowed (as in
//   tours/runTour.js); the guide's own synthetic events (isJourneyEvent) and
//   the guide's bubble pass. Esc pauses.
// - The sign-in offer (intro card, or «نكمل من فصل X؟») is off until
//   JOURNEY_AUTO_OFFER is turned on; offer() shows the card on demand.

export const JOURNEY_AUTO_OFFER = false;

// The drawings (DiceBear) load only when the guide first shows, not with the app.
const Guide = lazy(() => import("./Guide"));
const JourneyOffer = lazy(() => import("./JourneyOffer"));

const VERSION = 1;
const END_PATH = "/dashboard";
const DEFER_KEY = "tamheed_journey_deferred";
const TARGET_WAIT_MS = 4000;
const POLL_MS = 100;
const TYPING_POLL_MS = 250;
const MEASURE_MS = 400;
const RING_PAD = 6;
const BLOCKED = ["click", "dblclick", "auxclick", "contextmenu", "submit", "mousedown"];

const NOOP = {
  offer: () => false,
  startJourney: async () => false,
  stopJourney: () => {},
  running: false,
  currentChapterId: null,
};
const JourneyContext = createContext(NOOP);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// "Later" on the offer card lasts for this browser tab, for this user.
const readDeferred = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DEFER_KEY) || "null");
    return Boolean(saved && saved.user === getStoredUserId());
  } catch {
    return false;
  }
};

const writeDeferred = () => {
  try {
    sessionStorage.setItem(DEFER_KEY, JSON.stringify({ user: getStoredUserId() }));
  } catch {}
};

// A target counts when it is in the page and laid out.
const visibleTarget = (target) => {
  try {
    const el = document.querySelector(`[data-tour="${String(target).replace(/["\\]/g, "")}"]`);
    return el && el.getClientRects().length > 0 ? el : null;
  } catch {
    return null;
  }
};

const reveal = (el) => {
  try {
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {}
};

const inUi = (node) => Boolean(node && node.closest && node.closest("[data-journey-ui]"));

const fill = (text, name) => String(text || "").replace(/\{name\}/g, name);

const sameRect = (a, b) => a && b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

const chapterOf = (r) => (r ? r.chapters.find((c) => c.id === r.chapterId) || null : null);

function celebrateStep(chapter, next) {
  return {
    target: null,
    mood: "celebrate",
    title: `أحسنت! أنهيت فصل «${chapter.title}»`,
    body: next
      ? `في الفصل التالي: «${next.title}».`
      : "أنهيت المسار التدريبي كله. سأعيدك الآن إلى بياناتك الحقيقية.",
  };
}

export function JourneyProvider({ children }) {
  const navigate = useNavigate();
  const { on: demoOn } = useDemo();

  // run: { chapters, chapterId, index, celebrate, seq } while the journey runs.
  const [run, setRun] = useState(null);
  // shown: the step on screen, for run.seq; el is its target (or null).
  const [shown, setShown] = useState(null);
  const [rect, setRect] = useState(null);
  const [card, setCard] = useState(null);

  const runRef = useRef(null);
  const toursRef = useRef({});
  const startingRef = useRef(false);
  const busyRef = useRef(false);
  const seqRef = useRef(0);

  const updateRun = useCallback((next) => {
    runRef.current = next ? { ...next, seq: (seqRef.current += 1) } : null;
    setRun(runRef.current);
  }, []);

  const record = useCallback((id, status) => {
    saveTour(id, status, VERSION);
    toursRef.current = { ...toursRef.current, [id]: { status, version: VERSION } };
  }, []);

  // ---------- start / stop ----------
  const endJourney = useCallback(() => {
    busyRef.current = false;
    updateRun(null);
    setShown(null);
    stopDemo();
    navigate(END_PATH);
  }, [navigate, updateRun]);

  const stopJourney = useCallback(() => {
    if (runRef.current) endJourney();
  }, [endJourney]);

  const startJourney = useCallback(async (fromChapterId) => {
    if (runRef.current || startingRef.current) return false;
    startingRef.current = true;
    try {
      setCard(null);
      let ok = false;
      try {
        ok = await confirmLeave();
      } catch {
        ok = false;
      }
      if (!ok || runRef.current) return false;
      const chapters = availableChapters(CHAPTERS, getStoredPermissions());
      const chapter = (fromChapterId && chapters.find((c) => c.id === fromChapterId))
        || nextChapter(chapters, toursRef.current)
        || chapters[0];
      if (!chapter) return false;
      startDemo();
      updateRun({ chapters, chapterId: chapter.id, index: 0, celebrate: false });
      navigate(chapter.route);
      return true;
    } finally {
      startingRef.current = false;
    }
  }, [navigate, updateRun]);

  // Moves to a chapter (from its first step), or ends the journey when none is left.
  const goToChapter = useCallback((r, chapter) => {
    if (!chapter) {
      endJourney();
      return;
    }
    updateRun({ ...r, chapterId: chapter.id, index: 0, celebrate: false });
    navigate(chapter.route);
  }, [endJourney, navigate, updateRun]);

  const forward = useCallback((r) => {
    const chapter = chapterOf(r);
    if (!chapter) return;
    if (r.index + 1 < chapter.steps.length) {
      updateRun({ ...r, index: r.index + 1 });
      return;
    }
    record(chapter.id, "done");
    updateRun({ ...r, celebrate: true });
  }, [record, updateRun]);

  // Training mode ended elsewhere (sign-out): drop the journey quietly.
  useEffect(() => {
    if (!demoOn && runRef.current) {
      busyRef.current = false;
      updateRun(null);
      setShown(null);
    }
  }, [demoOn, updateRun]);

  // ---------- the step on screen ----------
  useEffect(() => {
    if (!run) {
      setShown(null);
      return undefined;
    }
    const chapter = chapterOf(run);
    if (!chapter) return undefined;
    if (run.celebrate) {
      setShown({ seq: run.seq, step: celebrateStep(chapter, nextChapter(run.chapters, toursRef.current)), el: null });
      return undefined;
    }
    const step = chapter.steps[run.index];
    if (!step.target) {
      setShown({ seq: run.seq, step, el: null });
      return undefined;
    }
    let alive = true;
    (async () => {
      const started = Date.now();
      let el = visibleTarget(step.target);
      while (!el && Date.now() - started < TARGET_WAIT_MS) {
        await sleep(POLL_MS);
        if (!alive) return;
        el = visibleTarget(step.target);
      }
      if (!alive) return;
      if (!el) {
        forward(run);
        return;
      }
      reveal(el);
      setShown({ seq: run.seq, step, el });
    })();
    return () => {
      alive = false;
    };
  }, [run, forward]);

  // The ring and the guide's arrow follow the target.
  const shownEl = shown && shown.el;
  useEffect(() => {
    if (!shownEl) {
      setRect(null);
      return undefined;
    }
    const measure = () => {
      const r = shownEl.getBoundingClientRect();
      const next = { top: r.top, left: r.left, width: r.width, height: r.height };
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };
    measure();
    const timer = setInterval(measure, MEASURE_MS);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [shownEl]);

  // ---------- the guide's buttons ----------
  const current = shown && run && shown.seq === run.seq ? shown : null;

  const onNext = useCallback(async () => {
    const r = runRef.current;
    if (!r || busyRef.current || !current || current.seq !== r.seq) return;
    if (r.celebrate) {
      goToChapter(r, nextChapter(r.chapters, toursRef.current));
      return;
    }
    const step = chapterOf(r).steps[r.index];
    if (step.action) {
      busyRef.current = true;
      try {
        await runAction(step.action, { navigate });
      } catch (error) {
        if (error?.code !== TARGET_MISSING) console.warn("journey: the step's action failed", error?.message || error);
      } finally {
        busyRef.current = false;
      }
      if (runRef.current !== r) return;
    }
    forward(r);
  }, [current, forward, goToChapter, navigate]);

  // The nearest earlier step that can be shown now (actions are not undone).
  const prevIndex = (() => {
    if (!current || run.celebrate) return -1;
    const steps = chapterOf(run).steps;
    for (let i = run.index - 1; i >= 0; i -= 1) {
      if (!steps[i].target || visibleTarget(steps[i].target)) return i;
    }
    return -1;
  })();

  const onPrev = useCallback(() => {
    const r = runRef.current;
    if (!r || busyRef.current || prevIndex < 0) return;
    updateRun({ ...r, index: prevIndex });
  }, [prevIndex, updateRun]);

  const onSkipChapter = useCallback(() => {
    const r = runRef.current;
    if (!r || busyRef.current) return;
    if (!r.celebrate) record(r.chapterId, "skipped");
    goToChapter(r, nextChapter(r.chapters, toursRef.current));
  }, [goToChapter, record]);

  // ---------- blocking the page ----------
  const running = Boolean(run);
  useEffect(() => {
    if (!running) return undefined;
    const onBlocked = (event) => {
      if (isJourneyEvent(event) || inUi(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const onKey = (event) => {
      if (isJourneyEvent(event)) return;
      if (event.key === "Escape" || event.key === "Esc") {
        event.preventDefault();
        event.stopPropagation();
        stopJourney();
        return;
      }
      if (!inUi(event.target) && (event.key === "Enter" || event.key === " " || event.key === "Spacebar")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    BLOCKED.forEach((name) => window.addEventListener(name, onBlocked, true));
    return () => {
      window.removeEventListener("keydown", onKey, true);
      BLOCKED.forEach((name) => window.removeEventListener(name, onBlocked, true));
    };
  }, [running, stopJourney]);

  // ---------- the offer ----------
  const offer = useCallback(() => {
    if (runRef.current) return false;
    const next = journeyOffer(availableChapters(CHAPTERS, getStoredPermissions()), toursRef.current);
    setCard(next);
    return Boolean(next);
  }, []);

  useEffect(() => {
    let alive = true;
    loadTourState().then(async (loaded) => {
      if (!alive || !loaded) return;
      // Anything recorded while loading wins.
      toursRef.current = { ...loaded.tours, ...toursRef.current };
      if (!JOURNEY_AUTO_OFFER || readDeferred()) return;
      const next = journeyOffer(availableChapters(CHAPTERS, getStoredPermissions()), toursRef.current, { auto: true });
      if (!next) return;
      // The card takes focus: wait until the user stops typing.
      const idle = await waitWhile(() => isTypingTarget(document.activeElement), {
        pause: () => sleep(TYPING_POLL_MS),
        cancelled: () => !alive,
      });
      if (!idle || !alive || runRef.current || startingRef.current) return;
      setCard(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const laterOffer = () => {
    writeDeferred();
    setCard(null);
  };

  const skipOffer = () => {
    record(INTRO_ID, "skipped");
    setCard(null);
  };

  const startOffer = () => {
    startJourney(card && card.kind === "resume" ? card.chapter.id : undefined);
  };

  // ---------- render ----------
  const currentChapterId = run ? run.chapterId : null;
  const value = useMemo(
    () => ({ offer, startJourney, stopJourney, running, currentChapterId }),
    [offer, startJourney, stopJourney, running, currentChapterId],
  );

  const guide = guideFor(getStoredGender());
  const name = GUIDE_NAMES[guide];
  const chapter = chapterOf(run);
  const chapterNumber = chapter ? run.chapters.indexOf(chapter) + 1 : 0;

  return (
    <JourneyContext.Provider value={value}>
      {children}

      <Suspense fallback={null}>
        {current && chapter && (
          <div data-journey-ui="" dir="rtl">
            <div className={styles.chapterBar} role="status">
              {`الفصل ${chapterNumber} من ${run.chapters.length}: ${chapter.title}`}
            </div>
            {rect && (
              <div
                className={styles.highlight}
                aria-hidden="true"
                style={{
                  top: rect.top - RING_PAD,
                  left: rect.left - RING_PAD,
                  width: rect.width + RING_PAD * 2,
                  height: rect.height + RING_PAD * 2,
                }}
              />
            )}
            <Guide
              guide={guide}
              mood={current.step.mood || "explain"}
              title={fill(current.step.title, name)}
              body={fill(current.step.body, name)}
              targetRect={rect}
              onNext={onNext}
              onPrev={onPrev}
              onPause={stopJourney}
              onSkipChapter={onSkipChapter}
              canPrev={prevIndex >= 0}
            />
          </div>
        )}

        {!run && card && (
          <JourneyOffer
            guide={guide}
            kind={card.kind}
            chapterTitle={card.chapter ? card.chapter.title : ""}
            onStart={startOffer}
            onLater={laterOffer}
            onSkip={skipOffer}
          />
        )}
      </Suspense>
    </JourneyContext.Provider>
  );
}

export const useJourney = () => useContext(JourneyContext);
