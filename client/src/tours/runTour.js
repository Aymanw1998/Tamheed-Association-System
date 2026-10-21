import { driver } from "driver.js";
import "driver.js/dist/driver.css";

import { pickText, tabEvent, tabSignal, tourTabs } from "./logic";
import styles from "./Tours.module.css";

// Shows one tour with driver.js and reports how it ended:
//   const stop = runTour(tour, { language, dir, t, onFinish });
//   onFinish("done" | "skipped" | "later") runs once; stop() ends it silently.
//   If driver.js throws while showing a step, the tour is stopped (page usable
//   again) and onError(error) runs instead of onFinish.
// `tour.steps` must already be the usable ones (usableSteps in TourProvider).
//
// Nothing on the page can be used while a tour is shown, only the popover:
// - driver.js `disableActiveInteraction` makes the highlighted element inert and
//   its CSS turns pointer events off for the rest of the page;
// - a capture listener on window swallows any click, and Enter/Space, aimed
//   outside the popover (keyboard focus could still reach the page);
// - driver.js 1.3.1 has no `overlayClickBehavior`: a click on the overlay asks
//   `onDestroyStarted`, which does nothing here, so the tour stays open.
// Keys are handled here (driver's own are off): Esc = "later", arrows move.
//
// A step with `menu: true` opens the side menu first (window event
// `tamheed:tour-menu` {open:true}) and it is closed ({open:false}) when the tour
// moves to a step without it or ends; a step with `tab` sends
// `tamheed:tour-tab` {tab} before it is shown, and in a tour that uses tabs a step
// without `tab` (and the end of the tour) sends {tab:null} to close the panel.

const MENU_WAIT_MS = 320;
const TAB_WAIT_MS = 200;

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const tourSelector = (target) => `[data-tour="${String(target).replace(/["\\]/g, "")}"]`;

const emit = (name, detail) => {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {}
};

const inPopover = (node) => Boolean(node && node.closest && node.closest(".driver-popover"));

export function runTour(tour, { language, dir, t, onFinish, onError }) {
  const steps = Array.isArray(tour?.steps) ? tour.steps : [];
  if (!steps.length) return () => {};

  const label = (key) => t(`tour.${key}`);
  let finished = false;
  let menuOpen = false;
  let panelOpen = false;
  let moving = false;
  let timer = null;

  const progress = label("progress").replace("{current}", "{{current}}").replace("{total}", "{{total}}");

  const d = driver({
    steps: steps.map((step) => ({
      element: step.target ? tourSelector(step.target) : undefined,
      popover: {
        title: escapeHtml(pickText(step.title, language)),
        description: escapeHtml(pickText(step.body, language)),
        ...(step.side ? { side: step.side } : {}),
        ...(step.align ? { align: step.align } : {}),
      },
    })),
    animate: true,
    allowClose: true,
    disableActiveInteraction: true,
    allowKeyboardControl: false,
    overlayColor: "#0f172a",
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 10,
    popoverClass: styles.popover,
    showProgress: steps.length > 1,
    progressText: progress,
    nextBtnText: label("next"),
    prevBtnText: label("prev"),
    doneBtnText: label("done"),
    onNextClick: () => go(index() + 1),
    onPrevClick: () => go(index() - 1),
    onCloseClick: () => finish("later"),
    // Overlay clicks land here: keep the tour open.
    onDestroyStarted: () => {},
    onPopoverRender: (popover) => {
      popover.wrapper.setAttribute("dir", dir);
      popover.wrapper.setAttribute("lang", language);
      popover.closeButton.setAttribute("aria-label", label("later"));
      popover.closeButton.setAttribute("title", label("later"));
      // Class names must not contain "driver-popover": driver.js swallows clicks on those.
      const row = document.createElement("div");
      row.className = styles.popoverExtra;
      row.append(
        makeButton(label("later"), styles.laterButton, () => finish("later")),
        makeButton(label("skip"), styles.skipButton, () => finish("skipped")),
      );
      popover.wrapper.appendChild(row);
    },
  });

  function makeButton(text, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onClick();
    });
    return button;
  }

  function index() {
    return d.getActiveIndex() ?? 0;
  }

  function setMenu(open) {
    if (open === menuOpen) return false;
    menuOpen = open;
    emit("tamheed:tour-menu", { open });
    return true;
  }

  function show(i) {
    if (finished) return;
    try {
      if (d.isActive()) d.moveTo(i);
      else d.drive(i);
    } catch (error) {
      fail(error);
    }
  }

  function fail(error) {
    if (!stop()) return;
    console.warn("tours: could not show the tour", error?.message || error);
    if (onError) onError(error);
  }

  function go(i) {
    if (finished || moving || i < 0) return;
    if (i >= steps.length) {
      finish("done");
      return;
    }
    const step = steps[i];
    let wait = setMenu(Boolean(step.menu)) ? MENU_WAIT_MS : 0;
    const signal = tabSignal(tour, step, panelOpen);
    if (signal) {
      emit("tamheed:tour-tab", signal);
      panelOpen = signal.tab != null;
      wait = Math.max(wait, TAB_WAIT_MS);
    }
    if (!wait) {
      show(i);
      return;
    }
    moving = true;
    timer = setTimeout(() => {
      moving = false;
      show(i);
    }, wait);
  }

  const onKey = (event) => {
    if (finished) return;
    if (event.key === "Escape" || event.key === "Esc") {
      event.preventDefault();
      event.stopPropagation();
      finish("later");
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      const forward = (event.key === "ArrowRight") !== (dir === "rtl");
      const next = index() + (forward ? 1 : -1);
      if (next < steps.length) go(next);
      return;
    }
    if (!inPopover(event.target) && (event.key === "Enter" || event.key === " " || event.key === "Spacebar")) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onClick = (event) => {
    if (finished || inPopover(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const BLOCKED = ["click", "dblclick", "auxclick", "contextmenu", "submit"];
  window.addEventListener("keydown", onKey, true);
  BLOCKED.forEach((name) => window.addEventListener(name, onClick, true));

  function stop() {
    if (finished) return false;
    finished = true;
    clearTimeout(timer);
    window.removeEventListener("keydown", onKey, true);
    BLOCKED.forEach((name) => window.removeEventListener(name, onClick, true));
    setMenu(false);
    if (panelOpen && tourTabs(tour).length) emit("tamheed:tour-tab", tabEvent(tour, null));
    panelOpen = false;
    try {
      d.destroy();
    } catch {}
    return true;
  }

  function finish(status) {
    if (stop() && onFinish) onFinish(status);
  }

  try {
    go(0);
  } catch (error) {
    fail(error);
  }
  return () => {
    stop();
  };
}
