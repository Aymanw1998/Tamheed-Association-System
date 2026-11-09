import React, { useEffect, useState } from "react";
import Icon from "../UI/Icon";
import { getMyParticipations } from "../../WebServer/services/lesson/functionsLesson.jsx";
import { lessonWhen } from "../../utils/recordLinks";
import { toHHMM, endOf } from "../../utils/lessonSchedule";
import { roomLabel } from "../../utils/rooms";
import styles from "./MyParticipations.module.css";

// «البرامج المسجّل فيها» (owner, 2026-11-09): at the bottom of the user's own
// page, the programs he takes part in as a participant, with his own latest
// attendance. Read-only and without links: being a participant does not open
// the lesson page. Nothing is shown when there are none (or the load failed).
const STATUS_CLASS = { "حاضر": "present", "متأخر": "late", "غائب": "absent" };
const dayMonth = (dateKey) => {
  const n = Number(dateKey) || 0;
  return `${String(n % 100).padStart(2, "0")}/${String(Math.floor(n / 100) % 100).padStart(2, "0")}`;
};

export default function MyParticipations() {
  const [lessons, setLessons] = useState([]);

  useEffect(() => {
    let alive = true;
    Promise.resolve(getMyParticipations()).then((res) => {
      if (alive && res?.ok) setLessons(res.lessons || []);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!lessons.length) return null;

  return (
    <section className={styles.section} aria-labelledby="my-participations-title">
      <h2 id="my-participations-title" className={styles.title}>
        <Icon name="calendar" size={20} /> البرامج المسجّل فيها
      </h2>
      <div className={styles.grid}>
        {lessons.map((lesson, i) => (
          <article key={lesson._id} className={`${styles.card} rise-in`} style={{ "--i": i }}>
            <h3 className={styles.name}>{lesson.name}</h3>
            <p className={styles.meta}>
              {lessonWhen(lesson)} – {toHHMM(endOf(lesson))} · {roomLabel(lesson.room)}
            </p>
            <p className={styles.meta}>
              المرشد: {lesson.teacherName || "—"}
              {lesson.helperName ? ` · المساعد: ${lesson.helperName}` : ""}
            </p>
            {lesson.attendance?.length > 0 && (
              <ul className={styles.marks} aria-label="آخر حضور">
                {lesson.attendance.map((row) => (
                  <li key={row.dateKey} className={`${styles.mark} ${styles[STATUS_CLASS[row.status]] || ""}`}>
                    <span className={styles.markDate}>{dayMonth(row.dateKey)}</span>
                    <span>{row.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
