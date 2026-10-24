import React, { useEffect, useId, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import Button from "../UI/Button.jsx";
import logo from "../../images/logo.png";
import { DAY_NAMES } from "../../utils/lessonSchedule";
import { birthDateLabel, cardCells, lessonDaysLabel } from "./sportForm";
import styles from "./PlayerCardModal.module.css";

// The shield outline of the front face, in the face's own 264x384 pixels.
const SHIELD =
  "M0 34 Q0 16 18 14 L100 6 Q132 0 164 6 L246 14 Q264 16 264 34 L264 318 Q264 332 250 338 L142 381 Q132 385 122 381 L14 338 Q0 332 0 318 Z";

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

function LogoBadge({ className = "" }) {
  return <span className={`${styles.logoBadge} ${className}`}><img src={logo} alt="" /></span>;
}

function FifaFace({ player, stats, t }) {
  const cells = cardCells(player, stats, { attendance: t("sport.card.attendance"), lates: t("sport.card.lates") });
  return (
    <div className={styles.fifa}>
      <div className={styles.fifaBody} style={{ clipPath: `path("${SHIELD}")` }}>
        <div className={styles.fifaBg} />
        <svg className={styles.fifaPitch} viewBox="0 0 264 384" aria-hidden="true">
          <circle cx="132" cy="150" r="96" />
          <path d="M0 232 H264" />
          <circle cx="132" cy="232" r="2.5" />
        </svg>
        <div className={styles.fifaShine} />
        <div className={styles.fifaSide}>
          <div className={`${styles.fifaNum} ${hasNumber(player) ? "" : styles.fifaNumNone}`}>{hasNumber(player) ? player.jerseyNumber : "—"}</div>
          {player.position && <div className={styles.fifaPos}>{player.position}</div>}
          <i className={styles.fifaRule} />
          <LogoBadge className={styles.fifaLogo} />
          <div className={styles.fifaSport} aria-hidden="true">⚽</div>
        </div>
        <div className={styles.fifaPhoto}>
          <Photo src={player.photo} className={`${styles.fifaImg} ${player.photo ? styles.fifaImgReal : ""}`} />
        </div>
        <div className={styles.fifaName}>{fullName(player)}</div>
        <div className={styles.fifaStats}>
          {cells.map((c, i) => (
            <div key={i}><b>{c.value}</b><span>{c.label}</span></div>
          ))}
        </div>
        <div className={styles.fifaFoot} dir="ltr">TAMHEED SPORT</div>
      </div>
      <svg className={styles.fifaFrame} viewBox="0 0 264 384" aria-hidden="true">
        <defs>
          <linearGradient id="staffFifaRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffd08a" />
            <stop offset=".45" stopColor="#f7941d" />
            <stop offset="1" stopColor="#c86d05" />
          </linearGradient>
        </defs>
        <path d={SHIELD} fill="none" stroke="url(#staffFifaRing)" strokeWidth="9" />
        <path
          d={SHIELD} fill="none" stroke="#ffd08a" strokeOpacity=".55" strokeWidth="1"
          transform="translate(132 192) scale(.94) translate(-132 -192)"
        />
      </svg>
    </div>
  );
}

function IdFace({ player, t }) {
  const rate = player.attendance?.rate;
  return (
    <div className={styles.idcard}>
      <svg className={styles.idPitch} viewBox="0 0 340 214" preserveAspectRatio="none" aria-hidden="true">
        <path d="M230 38 V214" />
        <circle cx="230" cy="126" r="54" />
      </svg>
      <div className={styles.idBar}>
        <span>{t("sport.card.brand")} · كرة القدم</span>
        <LogoBadge className={styles.idLogo} />
      </div>
      <div className={styles.idMain}>
        <div className={styles.idInfo}>
          <div className={styles.idName}>{fullName(player)}</div>
          <p><span>{t("sport.card.position")}:</span> {player.position || "—"} · <span>{t("sport.card.jersey")}:</span> {hasNumber(player) ? player.jerseyNumber : "—"}</p>
          <p><span>{t("sport.card.lessons")}:</span> {lessonDaysLabel(player.lessons, DAY_NAMES)}</p>
          <p><span>{t("sport.card.birthDate")}:</span> {birthDateLabel(player.birthDate)}</p>
          <p><span>{t("sport.card.attendance")}:</span> <bdi dir="ltr">{rate === null || rate === undefined ? "—" : `${rate}%`}</bdi></p>
        </div>
        <div className={styles.idPhoto}>
          <Photo src={player.photo} className={styles.idImg} />
        </div>
      </div>
      {hasNumber(player) && <div className={styles.idNum} aria-hidden="true">{player.jerseyNumber}</div>}
    </div>
  );
}

// A player's flip card in a modal. Closes with Escape, the backdrop or the close button.
export default function PlayerCardModal({ player, stats, onClose }) {
  const { t } = useI18n();
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
              <FifaFace player={player} stats={stats} t={t} />
            </div>
            <div className={`${styles.face} ${styles.faceBack}`} aria-hidden={!flipped}>
              <IdFace player={player} t={t} />
            </div>
          </div>
        </div>
        <p className={styles.hint}>{t("sport.card.flipHint")}</p>
        <Button variant="secondary" onClick={onClose}>{t("sport.close")}</Button>
      </div>
    </div>
  );
}
