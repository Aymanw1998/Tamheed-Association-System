import React from "react";
import Button from "../UI/Button.jsx";
import { useI18n } from "../../i18n/I18nContext";
import styles from "./Sport.module.css";

// A player's sign-in card: the QR (made by the server from the sport site's
// link) with the name and how to use it. Printing shows the card alone.
export default function LoginCardModal({ player, card, onClose }) {
  const { t } = useI18n();
  const label = (key) => t(`sport.players.${key}`);
  const name = `${player.firstname || ""} ${player.lastname || ""}`.trim();

  return (
    <div className={styles.cardBackdrop} role="dialog" aria-modal="true" aria-label={label("loginCard")} dir="rtl">
      <div className={styles.loginCardSheet}>
        <div className={styles.loginCard} data-testid="login-card">
          <strong className={styles.loginCardTitle}>تمهيد - رياضة</strong>
          <span className={styles.loginCardName}>{name}</span>
          {/* The SVG comes from our own server (the qrcode package), never from user input. */}
          <div className={styles.loginCardQr} dangerouslySetInnerHTML={{ __html: card.svg }} />
          <p className={styles.loginCardHow}>{label("loginCardHow")}</p>
          <p className={styles.loginCardKeep}>{label("loginCardKeep")}</p>
        </div>
        <div className={styles.loginCardActions}>
          <Button onClick={() => window.print()}>{label("loginCardPrint")}</Button>
          <Button variant="secondary" onClick={onClose}>{t("sport.close")}</Button>
        </div>
      </div>
    </div>
  );
}
