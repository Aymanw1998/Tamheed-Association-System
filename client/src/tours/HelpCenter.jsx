import { useEffect, useId, useRef } from "react";

import { useI18n } from "../i18n/I18nContext";
import styles from "./Tours.module.css";

// The "?" help center, the "what's new" list and the new-access card.
// They only show what they are given and report choices; TourProvider decides.

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

// chapters: the journey chapters this user may run; screen: the open screen's
// chapter (or null); tours: the saved done / skipped state.
export function HelpCenter({ chapters, screen, tours, onClose, onFullJourney, onChapter, onWhatsNew, onGuide }) {
  const { t } = useI18n();
  const h = (key) => t(`tour.help.${key}`);
  const statusOf = (id) => tours?.[id]?.status || "none";

  return (
    <Modal title={h("title")} onClose={onClose}>
      <p className={styles.intro}>{h("intro")}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.actionButton} disabled={!chapters.length} onClick={onFullJourney}>
          {h("fullJourney")}
        </button>
        <button type="button" className={styles.actionButton} disabled={!screen} onClick={() => onChapter(screen.id)}>
          {h("explainScreen")}
        </button>
        <button type="button" className={styles.actionButton} onClick={onWhatsNew}>{h("whatsNew")}</button>
        <button type="button" className={styles.actionButton} onClick={onGuide}>{h("guide")}</button>
      </div>
      {!screen && <p className={styles.note}>{h("noScreenChapter")}</p>}

      <h3 className={styles.sectionTitle}>{h("chaptersTitle")}</h3>
      {chapters.length === 0 ? (
        <p className={styles.note}>{h("noChapters")}</p>
      ) : (
        <ul className={styles.list}>
          {chapters.map((chapter) => {
            const status = statusOf(chapter.id);
            return (
              <li key={chapter.id} className={styles.row} data-chapter={chapter.id}>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{chapter.title}</span>
                  <span className={`${styles.status} ${status === "done" ? styles.statusDone : ""}`}>{h(`status.${status}`)}</span>
                </span>
                <button type="button" className={styles.primaryButton} onClick={() => onChapter(chapter.id)}>{h("start")}</button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

// canShow(release): whether its «أرني» has a chapter to run for this user.
export function WhatsNewModal({ releases, seen, canShow, onClose, onShow }) {
  const { t } = useI18n();
  const w = (key) => t(`tour.whatsNew.${key}`);
  const seenSet = new Set(seen || []);

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
              {canShow(release) && (
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
