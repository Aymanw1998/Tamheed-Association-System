import { useEffect, useId, useRef } from "react";

import { useI18n } from "../i18n/I18nContext";
import { canAccessPath } from "../utils/routeAccess";
import { can, helpTours, tourForPath } from "./logic";
import { TOURS } from "./registry";
import { tourSelector } from "./runTour";
import styles from "./Tours.module.css";

// The "?" help center, the "what's new" list and the new-access card.
// They only show what they are given and report choices; TourProvider decides.

export const tourName = (tour, t) =>
  t(`tour.names.${tour.id}`, "") || tour.steps?.[0]?.title || tour.id;

function Modal({ title, onClose, children }) {
  const { dir } = useI18n();
  const titleId = useId();
  const boxRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    const first = boxRef.current?.querySelector("button:not(:disabled)");
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={boxRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={titleId} dir={dir}>
        <div className={styles.modalHeader}>
          <h2 id={titleId} className={styles.modalTitle}>{title}</h2>
          <CloseButton onClose={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

function CloseButton({ onClose }) {
  const { t } = useI18n();
  return (
    <button type="button" className={styles.closeButton} onClick={onClose} aria-label={t("tour.help.close")}>×</button>
  );
}

export function HelpCenter({ pathname, permissions, tours, onClose, onStart, onWhatsNew }) {
  const { t } = useI18n();
  const h = (key) => t(`tour.help.${key}`);
  const screenTour = tourForPath(pathname);
  const screenOk = Boolean(screenTour && can(permissions, screenTour.requires ?? null));
  const list = helpTours({ permissions, canOpen: (path) => canAccessPath(path, permissions) });
  // The assistant has no page of its own: it starts here when its button is on screen.
  const assistant = TOURS.find((x) => x.id === "assistant");
  const assistantOk = Boolean(assistant && can(permissions, assistant.requires ?? null) && document.querySelector(tourSelector("assistant-button")));
  const entries = [...list.map(({ tour }) => tour), ...(assistantOk ? [assistant] : [])];
  const statusOf = (id) => tours?.[id]?.status || "none";

  return (
    <Modal title={h("title")} onClose={onClose}>
      <p className={styles.intro}>{h("intro")}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.actionButton} disabled={!screenOk} onClick={() => onStart(screenTour.id)}>
          {h("explainScreen")}
        </button>
        {TOURS.some((x) => x.id === "welcome") && (
          <button type="button" className={styles.actionButton} onClick={() => onStart("welcome")}>{h("generalTour")}</button>
        )}
        <button type="button" className={styles.actionButton} onClick={onWhatsNew}>{h("whatsNew")}</button>
      </div>
      {!screenOk && <p className={styles.note}>{h("noScreenTour")}</p>}

      <h3 className={styles.sectionTitle}>{h("toursTitle")}</h3>
      {entries.length === 0 ? (
        <p className={styles.note}>{h("noTours")}</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((tour) => {
            const status = statusOf(tour.id);
            return (
              <li key={tour.id} className={styles.row}>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{tourName(tour, t)}</span>
                  <span className={`${styles.status} ${status === "done" ? styles.statusDone : ""}`}>{h(`status.${status}`)}</span>
                </span>
                <button type="button" className={styles.primaryButton} onClick={() => onStart(tour.id)}>{h("start")}</button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

export function WhatsNewModal({ releases, seen, permissions, onClose, onShow }) {
  const { t } = useI18n();
  const w = (key) => t(`tour.whatsNew.${key}`);
  const seenSet = new Set(seen || []);
  const showable = (release) => {
    const tour = release.tourId && TOURS.find((x) => x.id === release.tourId);
    return Boolean(tour && can(permissions, tour.requires ?? null));
  };

  return (
    <Modal title={w("title")} onClose={onClose}>
      {releases.length === 0 ? (
        <p className={styles.note}>{w("empty")}</p>
      ) : (
        <ul className={styles.list}>
          {releases.map((release) => (
            <li key={release.id} className={styles.release}>
              <div className={styles.releaseHead}>
                <h3 className={styles.releaseTitle}>{release.title}</h3>
                {!seenSet.has(release.id) && <span className={styles.badge}>{w("newBadge")}</span>}
                <time className={styles.releaseDate} dateTime={release.date}>{release.date}</time>
              </div>
              <p className={styles.releaseBody}>{release.body}</p>
              {showable(release) && (
                <div className={styles.releaseActions}>
                  <button type="button" className={styles.primaryButton} onClick={() => onShow(release)}>{w("showMe")}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// Small card, not a dialog: the page stays usable behind it.
export function AccessPrompt({ sections, abilities, onShow, onLater }) {
  const { dir, t } = useI18n();
  const a = (key) => t(`tour.access.${key}`);
  const nameOf = (section) => t(`perms.modules.${section}`, section);
  const items = [
    ...sections.map((section) => ({ section, kind: "section", text: a("newSection").replace("{name}", nameOf(section)) })),
    ...abilities.map((section) => ({ section, kind: "ability", text: a("newAbility").replace("{name}", nameOf(section)) })),
  ];

  return (
    <section className={styles.accessCard} role="status" aria-live="polite" dir={dir}>
      <h2 className={styles.accessTitle}>{a("title")}</h2>
      {items.map((item) => (
        <div key={`${item.kind}-${item.section}`} className={styles.accessItem}>
          <span>{item.text}</span>
          <button type="button" className={styles.primaryButton} onClick={() => onShow(item)}>{a("showMe")}</button>
        </div>
      ))}
      <div className={styles.accessFooter}>
        <button type="button" className={styles.ghostButton} onClick={onLater}>{a("notNow")}</button>
      </div>
    </section>
  );
}
