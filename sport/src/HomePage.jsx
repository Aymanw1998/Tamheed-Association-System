import { useRef, useState } from "react";
import PlayerCard from "./PlayerCard.jsx";
import { formatTrainingDate } from "./format.js";

export default function HomePage({ me }) {
  const { cards, nextTraining, student } = me;
  const [index, setIndex] = useState(0);
  const rowRef = useRef(null);

  const onScroll = () => {
    const el = rowRef.current;
    if (!el || !el.clientWidth) return;
    // RTL scrolling uses negative offsets in some browsers, so take the absolute value.
    setIndex(Math.min(cards.length - 1, Math.round(Math.abs(el.scrollLeft) / el.clientWidth)));
  };

  return (
    <>
      {cards.length > 0 && (
        <>
          <div className="cards-row" ref={rowRef} onScroll={onScroll}>
            {cards.map((c) => (
              <div className="card-slide" key={c.sport.id}>
                <PlayerCard card={c} student={student} />
              </div>
            ))}
          </div>
          {cards.length > 1 && (
            <div className="dots" aria-hidden="true">
              {cards.map((c, i) => (
                <span key={c.sport.id} className={i === index ? "on" : ""} />
              ))}
            </div>
          )}
        </>
      )}
      <section className="box">
        <h4>التدريب القادم</h4>
        {nextTraining ? (
          <div className="row">
            <span>
              {nextTraining.sportIcon} {nextTraining.teamName}
              {nextTraining.place ? ` · ${nextTraining.place}` : ""}
            </span>
            <span className="pill">{formatTrainingDate(nextTraining.startsAt, new Date())}</span>
          </div>
        ) : (
          <p className="muted">لا يوجد تدريب قادم</p>
        )}
      </section>
    </>
  );
}
