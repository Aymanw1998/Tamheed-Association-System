import { useI18n } from "../../i18n/I18nContext";
import { ACCESSIBILITY_CONTENT, ACCESSIBILITY_COORDINATOR, ACCESSIBILITY_UPDATED } from "../../utils/accessibilityContent";
import styles from "../Privacy/PrivacyPage.module.css";

// Public page (no sign-in): the accessibility statement (owner, 2026-11-17).
export default function AccessibilityPage() {
  const { dir } = useI18n();
  const page = ACCESSIBILITY_CONTENT;
  const who = ACCESSIBILITY_COORDINATOR;
  return (
    <main className={styles.page} dir={dir}>
      <h1>{page.title}</h1>
      <p className={styles.updated}>{page.updated}: {ACCESSIBILITY_UPDATED}</p>
      <p>{page.intro}</p>
      {page.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ))}
      <section>
        <h2>منسّق الإتاحة</h2>
        <ul>
          {who.name && <li>الاسم: {who.name}</li>}
          {who.phone && <li>الهاتف: <a href={`tel:${who.phone.replace(/\D/g, "")}`} dir="ltr">{who.phone}</a></li>}
          {who.email && <li>البريد الإلكتروني: <a href={`mailto:${who.email}`}>{who.email}</a></li>}
        </ul>
      </section>
    </main>
  );
}
