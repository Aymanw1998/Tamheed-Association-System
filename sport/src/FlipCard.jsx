import { useEffect, useState } from "react";
import { getIdNumber, photoUrl } from "./api.js";
import { cardCells, birthDateLabel } from "./format.js";
import { Silhouette, LogoBadge, FlipIcon } from "./Art.jsx";
import { CardBack, CardPanel, FACE_CLIP, IdArt } from "./CardArt.jsx";

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
      <CardBack className="fifa-art" />
      <div className="fifa-body" style={{ clipPath: `path("${FACE_CLIP}")` }}>
        <div className="fifa-side">
          <div className={`fifa-num${card.jerseyNumber == null ? " none" : ""}`}>{card.jerseyNumber ?? "—"}</div>
          {card.position && <div className="fifa-pos">{card.position}</div>}
          <i className="fifa-rule" />
          <LogoBadge className="fifa-logo" />
          <div className="fifa-sport" aria-hidden="true">{card.sport?.icon || "⚽"}</div>
        </div>

        {/* The cut-out player photo stands on the card; a plain photo is faded round. */}
        <div className={`fifa-photo${student.photoCutout ? " cut" : ""}`}>
          <Photo hasPhoto={student.hasPhoto} version={student.photoVersion} className="fifa-img" />
        </div>

        <CardPanel className="fifa-panel" />

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
    </div>
  );
}

export function IdFace({ student, card, tz }) {
  const name = [student.firstname, student.lastname].filter(Boolean).join(" ");
  return (
    <div className="idcard">
      <IdArt className="id-art" />
      <div className="id-bar">
        <span>تمهيد - رياضة</span>
        <LogoBadge className="id-logo" />
      </div>
      <div className="id-main">
        <div className="id-info">
          <div className="id-name">{name}</div>
          <dl className="id-rows">
            <dt>رقم الهوية</dt>
            <dd><bdi dir="ltr">{tz || "—"}</bdi></dd>
            <dt>رقم القميص</dt>
            <dd>{card.jerseyNumber ?? "—"}</dd>
            <dt>تاريخ الميلاد</dt>
            <dd>{birthDateLabel(student.birthDate)}</dd>
            <dt>مرشد تربوي</dt>
            <dd>{student.mentor || "—"}</dd>
          </dl>
        </div>
        <div className={`id-photo${student.photoCutout ? " cut" : ""}`}>
          <Photo hasPhoto={student.hasPhoto} version={student.photoVersion} className="id-img" />
        </div>
      </div>
      {card.jerseyNumber != null && <div className="id-num" aria-hidden="true">{card.jerseyNumber}</div>}
      <div className="id-foot" dir="ltr">TAMHEED SPORT</div>
    </div>
  );
}

// The ID number comes on its own, never from the offline cache: offline the
// card shows a dash. Asked again with every new card (`me`), so another
// sign-in in a second tab never leaves the first student's number showing.
function useIdNumber(me) {
  const [tz, setTz] = useState("");
  useEffect(() => {
    let gone = false;
    setTz("");
    getIdNumber().then((r) => {
      if (!gone && r.ok) setTz(String(r.data?.tz || ""));
    });
    return () => {
      gone = true;
    };
  }, [me]);
  return tz;
}

export default function FlipCard({ me }) {
  const tz = useIdNumber(me);
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
            <IdFace student={me.student} card={me.card} tz={tz} />
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
