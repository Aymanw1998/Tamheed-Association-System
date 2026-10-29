import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useJourney } from "../journey/JourneyProvider";
import { CHAPTERS } from "../journey/chapters";
import { availableChapters } from "../journey/journeyLogic";
import { getStoredPermissions, getStoredUserId } from "../utils/session";
import { GUIDE_LANGS, GUIDE_UI } from "./guideContent";
import { newEntryIds, readLang, readSeen, searchGuide, seenAfter, visibleGuide, writeLang, writeSeen } from "./guideLogic";
import styles from "./GuidePage.module.css";

const LANG_NAMES = { ar: "العربية", he: "עברית" };

// The user guide: a short card per screen this user can open, in Arabic or
// Hebrew. Cards start folded (title and one line) so a phone shows many at
// once; «أرني» runs the screen's journey chapter on demo data.
export default function GuidePage() {
  const navigate = useNavigate();
  const journey = useJourney();
  const [lang, setLang] = useState(readLang);
  const [query, setQuery] = useState("");
  const ui = GUIDE_UI[lang];

  // Read once per visit: the same permissions give the same entries.
  const [permissions] = useState(getStoredPermissions);
  const userId = getStoredUserId();
  const entries = useMemo(() => visibleGuide(permissions), [permissions]);
  const chapterIds = useMemo(
    () => new Set(availableChapters(CHAPTERS, permissions).map((c) => c.id)),
    [permissions],
  );

  // "New" is decided once, from the visit before this one; then this visit
  // is remembered.
  const [fresh] = useState(() => new Set(newEntryIds(entries, readSeen(userId))));
  useEffect(() => {
    writeSeen(userId, seenAfter(entries, readSeen(userId)));
  }, [userId, entries]);

  const chooseLang = (next) => {
    setLang(next);
    writeLang(next);
  };

  const shown = searchGuide(entries, query, lang);

  return (
    <main className={styles.page} dir="rtl" lang={lang}>
      <header className={styles.head}>
        <h1 className={styles.title}>{ui.title}</h1>
        <div className={styles.langs} role="group" aria-label={ui.language}>
          {GUIDE_LANGS.map((code) => (
            <button
              key={code}
              type="button"
              lang={code}
              className={`${styles.lang} ${code === lang ? styles.langOn : ""}`}
              aria-pressed={code === lang}
              onClick={() => chooseLang(code)}
            >
              {LANG_NAMES[code]}
            </button>
          ))}
        </div>
      </header>
      <p className={styles.intro}>{ui.intro}</p>

      <input
        type="search"
        className={styles.search}
        placeholder={ui.search}
        aria-label={ui.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {shown.length === 0 ? (
        <p className={styles.empty}>{ui.noResults}</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((entry) => (
            <li key={entry.id} data-guide={entry.id}>
              <details className={styles.card} open={Boolean(query.trim())}>
                <summary className={styles.cardHead}>
                  <span className={styles.cardTitle}>
                    {entry.title[lang]}
                    {fresh.has(entry.id) && <span className={styles.badge}>{ui.newBadge}</span>}
                  </span>
                  <span className={styles.cardSummary}>{entry.summary[lang]}</span>
                </summary>
                <ol className={styles.steps}>
                  {entry.steps.map((step) => (
                    <li key={step.text.ar}>{step.text[lang]}</li>
                  ))}
                </ol>
                <div className={styles.actions}>
                  {journey && chapterIds.has(entry.chapterId) && (
                    <button type="button" className={styles.primary} onClick={() => journey.startJourney(entry.chapterId, { only: true })}>
                      {ui.showMe}
                    </button>
                  )}
                  <button type="button" className={styles.ghost} onClick={() => navigate(entry.path)}>
                    {ui.open}
                  </button>
                  <span className={styles.updated}>
                    {ui.updated}: <time dateTime={entry.updated.slice(0, 10)}>{entry.updated.slice(0, 10)}</time>
                  </span>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
