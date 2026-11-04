import React, { useEffect, useState } from "react";
import Button from "../UI/Button.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { cardPicture, printCard, sendCard } from "./cardShare";
import styles from "./Sport.module.css";

const TITLE = "تمهيد - رياضة";

// A player's sign-in card: the QR (made by the server from the sport site's
// link) with the name and how to use it. Printing shows the card alone; in the
// installed app it goes through the share sheet, as does sending.
export default function LoginCardModal({ player, card, onClose }) {
  const { t } = useI18n();
  const label = (key) => t(`sport.players.${key}`);
  const name = `${player.firstname || ""} ${player.lastname || ""}`.trim();
  // Made ahead: a share must start right from the press, with nothing to wait for.
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (!card.png) return undefined;
    let alive = true;
    cardPicture({ png: card.png, title: TITLE, name, how: label("loginCardHow"), keep: label("loginCardKeep") })
      .then((made) => { if (alive) setFile(made); })
      .catch(() => {});
    return () => { alive = false; };
  }, [card.png, name]);

  const tell = (result) => {
    if (result === "copied") toast.success(label("loginCardCopied"));
    else if (result === "downloaded") toast.success(label("loginCardSaved"));
    else if (result === "failed") toast.error(label("loginCardFailed"));
  };
  const details = { file, url: card.url, name };

  return (
    <div className={styles.cardBackdrop} role="dialog" aria-modal="true" aria-label={label("loginCard")} dir="rtl">
      <div className={styles.loginCardSheet}>
        <div className={styles.loginCard} data-testid="login-card">
          <strong className={styles.loginCardTitle}>{TITLE}</strong>
          <span className={styles.loginCardName}>{name}</span>
          {/* The SVG comes from our own server (the qrcode package), never from user input. */}
          <div className={styles.loginCardQr} dangerouslySetInnerHTML={{ __html: card.svg }} />
          <p className={styles.loginCardHow}>{label("loginCardHow")}</p>
          <p className={styles.loginCardKeep}>{label("loginCardKeep")}</p>
        </div>
        <div className={styles.loginCardActions}>
          <Button onClick={async () => tell(await printCard(details))}>{label("loginCardPrint")}</Button>
          <Button onClick={async () => tell(await sendCard(details))}>{label("loginCardSend")}</Button>
          <Button variant="secondary" onClick={onClose}>{t("sport.close")}</Button>
        </div>
      </div>
    </div>
  );
}
