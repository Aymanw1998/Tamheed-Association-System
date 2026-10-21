import { useI18n } from "../i18n/I18nContext";
import { useTour } from "./TourProvider";
import styles from "./Tours.module.css";

// "New" next to a menu entry whose section was just opened to the user; it
// goes away once they visit the section (TourProvider marks its keys known).
export default function NewBadge({ section }) {
  const { newSections } = useTour();
  const { t } = useI18n();
  if (!newSections?.includes(section)) return null;
  return <span className={styles.menuBadge}>{t("tour.whatsNew.newBadge")}</span>;
}
