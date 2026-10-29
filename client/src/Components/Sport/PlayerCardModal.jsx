import React, { useEffect, useId, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import Button from "../UI/Button.jsx";
import logo from "../../images/logo.png";
import { birthDateLabel, cardCells } from "./sportForm";
import { getPlayerPhoto } from "../../WebServer/services/sport/functionsSport";
import { CardBack, CardPanel, FACE_CLIP, IdArt } from "./CardArt";
import styles from "./PlayerCardModal.module.css";

const fullName = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim();
const hasNumber = (p) => p.jerseyNumber !== null && p.jerseyNumber !== undefined;

// A player outline in a jersey, used when the student has no photo.
export function Silhouette({ className }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 120 130" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".92" />
          <stop offset="1" stopColor="#d5e4e8" stopOpacity=".78" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="40" rx="20" ry="23" fill={`url(#${id}f)`} />
      <path
        d="M8 130 C10 100 24 84 47 78 C51 76 52 72 52 62 L68 62 C68 72 69 76 73 78 C96 84 110 100 112 130 Z"
        fill={`url(#${id}f)`}
      />
      <path d="M47 78 L60 91 L73 78" fill="none" stroke="#f7941d" strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  );
}

function Photo({ src, className }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <Silhouette className={className} />;
  return <img className={className} src={src} alt="" onError={() => setFailed(true)} />;
}

// The player's cut-out photo once the server has made it (fetched with the
// session, so through an object URL); until then the student's photo.
function usePlayerPhoto(player) {
  const [cut, setCut] = useState(null);
  useEffect(() => {
    setCut(null);
    if (!player.photoCutout) return undefined;
    let gone = false;
    let url = null;
    getPlayerPhoto(player.studentId).then((blob) => {
      if (gone || !blob) return;
      url = URL.createObjectURL(blob);
      setCut(url);
    });
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [player.studentId, player.photo, player.photoCutout]);
  return cut ? { src: cut, isCut: true } : { src: player.photo, isCut: false };
}

function LogoBadge({ className = "" }) {
  return <span className={`${styles.logoBadge} ${className}`}><img src={logo} alt="" /></span>;
}

function FifaFace({ player, photo, stats, t }) {
  const cells = cardCells(player, stats, { attendance: t("sport.card.attendance"), lates: t("sport.card.lates") });
  const imgClass = photo.isCut ? styles.fifaImgCut : photo.src ? styles.fifaImgReal : "";
  return (
    <div className={styles.fifa}>
      <CardBack className={styles.fifaArt} />
      <div className={styles.fifaBody} style={{ clipPath: `path("${FACE_CLIP}")` }}>
        <div className={styles.fifaSide}>
          <div className={`${styles.fifaNum} ${hasNumber(player) ? "" : styles.fifaNumNone}`}>{hasNumber(player) ? player.jerseyNumber : "—"}</div>
          {player.position && <div className={styles.fifaPos}>{player.position}</div>}
          <i className={styles.fifaRule} />
          <LogoBadge className={styles.fifaLogo} />
          <div className={styles.fifaSport} aria-hidden="true">⚽</div>
        </div>
        <div className={styles.fifaPhoto}>
          <Photo key={photo.src} src={photo.src} className={`${styles.fifaImg} ${imgClass}`} />
        </div>
        <CardPanel className={styles.fifaPanel} />
        <div className={styles.fifaName}>{fullName(player)}</div>
        <div className={styles.fifaStats}>
          {cells.map((c, i) => (
            <div key={i}><b>{c.value}</b><span>{c.label}</span></div>
          ))}
        </div>
        <div className={styles.fifaFoot} dir="ltr">TAMHEED SPORT</div>
      </div>
    </div>
  );
}

function IdFace({ player, photo, t }) {
  return (
    <div className={styles.idcard}>
      <IdArt className={styles.idArt} />
      <div className={styles.idBar}>
        <span>{t("sport.card.brandFull")}</span>
        <LogoBadge className={styles.idLogo} />
      </div>
      <div className={styles.idMain}>
        <div className={styles.idInfo}>
          <div className={styles.idName}>{fullName(player)}</div>
          <dl className={styles.idRows}>
            <dt>{t("sport.card.idNumber")}</dt>
            <dd><bdi dir="ltr">{player.tz || "—"}</bdi></dd>
            <dt>{t("sport.card.jerseyNumber")}</dt>
            <dd>{hasNumber(player) ? player.jerseyNumber : "—"}</dd>
            <dt>{t("sport.card.birthDate")}</dt>
            <dd>{birthDateLabel(player.birthDate)}</dd>
            <dt>{t("sport.card.mentor")}</dt>
            <dd>{player.mentor || "—"}</dd>
          </dl>
        </div>
        <div className={`${styles.idPhoto} ${photo.isCut ? styles.idPhotoCut : ""}`}>
          <Photo key={photo.src} src={photo.src} className={`${styles.idImg} ${photo.isCut ? styles.idImgCut : ""}`} />
        </div>
      </div>
      {hasNumber(player) && <div className={styles.idNum} aria-hidden="true">{player.jerseyNumber}</div>}
      <div className={styles.idFoot} dir="ltr">TAMHEED SPORT</div>
    </div>
  );
}

// A player's flip card in a modal. Closes with Escape, the backdrop or the close button.
export default function PlayerCardModal({ player, stats, onClose }) {
  const { t } = useI18n();
  const photo = usePlayerPhoto(player);
  const [flipped, setFlipped] = useState(false);
  const toggle = () => setFlipped((f) => !f);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={`${t("sport.card.title")}: ${fullName(player)}`} dir="rtl">
        <div
          className={`${styles.flip} ${flipped ? styles.on : ""}`}
          role="button"
          tabIndex={0}
          aria-pressed={flipped}
          onClick={toggle}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
        >
          <div className={styles.flipIn}>
            <div className={`${styles.face} ${styles.faceFront}`} aria-hidden={flipped}>
              <FifaFace player={player} photo={photo} stats={stats} t={t} />
            </div>
            <div className={`${styles.face} ${styles.faceBack}`} aria-hidden={!flipped}>
              <IdFace player={player} photo={photo} t={t} />
            </div>
          </div>
        </div>
        <p className={styles.hint}>{t("sport.card.flipHint")}</p>
        <Button variant="secondary" onClick={onClose}>{t("sport.close")}</Button>
      </div>
    </div>
  );
}
