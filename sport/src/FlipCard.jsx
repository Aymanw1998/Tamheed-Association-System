import { useState } from "react";
import { photoUrl } from "./api.js";
import { cardCells, lessonDays, birthDateLabel, attendanceLabel } from "./format.js";
import { Silhouette, LogoBadge, FlipIcon } from "./Art.jsx";

// The shield outline of the front face, in the face's own 264×384 pixels.
const SHIELD =
  "M0 34 Q0 16 18 14 L100 6 Q132 0 164 6 L246 14 Q264 16 264 34 L264 318 Q264 332 250 338 L142 381 Q132 385 122 381 L14 338 Q0 332 0 318 Z";

function Photo({ hasPhoto, version, className }) {
  const src = photoUrl(version);
  const [failedSrc, setFailedSrc] = useState(null);
  if (!hasPhoto || failedSrc === src) return <Silhouette className={className} />;
  return <img className={className} src={src} alt="" onError={() => setFailedSrc(src)} />;
}

export function FifaFace({ student, card }) {
  const name = [student.firstname, student.lastname].filter(Boolean).join(" ");
  return (
    <div className="fifa">
      <div className="fifa-body" style={{ clipPath: `path("${SHIELD}")` }}>
        <div className="fifa-bg" />
        <svg className="fifa-pitch" viewBox="0 0 264 384" aria-hidden="true">
          <circle cx="132" cy="150" r="96" />
          <path d="M0 232 H264" />
          <circle cx="132" cy="232" r="2.5" />
        </svg>
        <div className="fifa-shine" />

        <div className="fifa-side">
          <div className={`fifa-num${card.jerseyNumber == null ? " none" : ""}`}>{card.jerseyNumber ?? "—"}</div>
          {card.position && <div className="fifa-pos">{card.position}</div>}
          <i className="fifa-rule" />
          <LogoBadge className="fifa-logo" />
          <div className="fifa-sport" aria-hidden="true">{card.sport?.icon || "⚽"}</div>
        </div>

        <div className="fifa-photo">
          <Photo hasPhoto={student.hasPhoto} version={student.photoVersion} className="fifa-img" />
        </div>

        <div className="fifa-name">{name}</div>

        <div className="fifa-stats">
          {cardCells(card).map((c, i) => (
            <div key={i}>
              <b>{c.value}</b>
              <span>{c.label}</span>
            </div>
          ))}
        </div>

        <div className="fifa-foot" dir="ltr">TAMHEED SPORT</div>
      </div>
      <svg className="fifa-frame" viewBox="0 0 264 384" aria-hidden="true">
        <defs>
          <linearGradient id="fifaRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffd08a" />
            <stop offset=".45" stopColor="#f7941d" />
            <stop offset="1" stopColor="#c86d05" />
          </linearGradient>
        </defs>
        <path d={SHIELD} fill="none" stroke="url(#fifaRing)" strokeWidth="9" />
        <path
          d={SHIELD}
          fill="none"
          stroke="#ffd08a"
          strokeOpacity=".55"
          strokeWidth="1"
          transform="translate(132 192) scale(.94) translate(-132 -192)"
        />
      </svg>
    </div>
  );
}

export function IdFace({ student, card, lessons }) {
  const name = [student.firstname, student.lastname].filter(Boolean).join(" ");
  return (
    <div className="idcard">
      <svg className="id-pitch" viewBox="0 0 340 214" preserveAspectRatio="none" aria-hidden="true">
        <path d="M230 38 V214" />
        <circle cx="230" cy="126" r="54" />
      </svg>
      <div className="id-bar">
        <span>تمهيد - رياضة · {card.sport?.name}</span>
        <LogoBadge className="id-logo" />
      </div>
      <div className="id-main">
        <div className="id-info">
          <div className="id-name">{name}</div>
          <p>
            <span>المركز:</span> {card.position || "—"} · <span>القميص:</span> {card.jerseyNumber ?? "—"}
          </p>
          <p>
            <span>الدروس:</span> {lessonDays(lessons)}
          </p>
          <p>
            <span>تاريخ الميلاد:</span> {birthDateLabel(student.birthDate)}
          </p>
          <p>
            <span>الحضور:</span> <bdi dir="ltr">{attendanceLabel(card.attendance?.rate)}</bdi>
          </p>
        </div>
        <div className="id-photo">
          <Photo hasPhoto={student.hasPhoto} version={student.photoVersion} className="id-img" />
        </div>
      </div>
      {card.jerseyNumber != null && <div className="id-num" aria-hidden="true">{card.jerseyNumber}</div>}
    </div>
  );
}

export default function FlipCard({ me }) {
  const [flipped, setFlipped] = useState(false);
  const toggle = () => setFlipped((f) => !f);
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
  return (
    <div className="flip-wrap">
      <div
        className={`flip${flipped ? " on" : ""}`}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <div className="flip-in">
          <div className="face face-front" aria-hidden={flipped}>
            <FifaFace student={me.student} card={me.card} />
          </div>
          <div className="face face-back" aria-hidden={!flipped}>
            <IdFace student={me.student} card={me.card} lessons={me.lessons} />
          </div>
        </div>
      </div>
      <p className="flip-hint">
        <FlipIcon />
        اضغط لقلب البطاقة
      </p>
    </div>
  );
}
