import { useI18n } from "../../i18n/I18nContext";
import { PRIVACY_CONTACT, PRIVACY_CONTENT, PRIVACY_UPDATED } from "../../utils/privacyContent";
import styles from "./PrivacyPage.module.css";

// Public page (no sign-in): Google's OAuth consent screen links here.
export default function PrivacyPage() {
  const { dir } = useI18n();
  const page = PRIVACY_CONTENT;
  const fill = (text) => text.replace("{contact}", PRIVACY_CONTACT);

  return (
    <main className={styles.page} dir={dir}>
      <h1>{page.title}</h1>
      <p className={styles.updated}>
        {page.updated}: {PRIVACY_UPDATED}
      </p>
      <p>{page.intro}</p>

      {page.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{fill(item)}</li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
