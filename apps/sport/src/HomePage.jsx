import FlipCard from "./FlipCard.jsx";
import { CalendarIcon } from "./Art.jsx";
import PushButton from "./pwa/PushButton.jsx";
import { lessonTime, nextLessonLabel } from "./format.js";

// Football lessons are always held in room 9.
const PLACE = "التدريب الخارجي";

export default function HomePage({ me }) {
  const next = me.nextLesson;
  return (
    <div className="home-grid">
      <div className="home-card">
        <FlipCard me={me} />
      </div>
      <div className="home-side">
      <section className="panel next">
        <span className="next-icon">
          <CalendarIcon />
        </span>
        <div className="next-body">
          <div className="next-head">
            <h2>الدرس القادم</h2>
            {next && <span className="pill">{nextLessonLabel(next, new Date())}</span>}
          </div>
          {next ? (
            <>
              <b>{next.name}</b>
              <small>
                {lessonTime(next)} · {PLACE}
              </small>
            </>
          ) : (
            <p className="muted">لا يوجد درس قادم</p>
          )}
        </div>
      </section>
      <PushButton />
      </div>
    </div>
  );
}
