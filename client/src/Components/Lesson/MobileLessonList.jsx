import React, { useEffect, useMemo, useRef } from "react";
import styles from "./MobileLessonList.module.css";
import { DAY_NAMES, countLessonsByDay, endOf, lessonsForDay, startOf, toHHMM } from "../../utils/lessonSchedule";
import { isNamedPlace, roomLabel } from "../../utils/rooms";

// Phone layout for the lesson program: one day at a time, picked from a row of
// day chips, with the lessons listed by start time. `onOpen` is omitted for
// users who can't open a lesson, which leaves the cards as plain text.
export default function MobileLessonList({ lessons, day, onDayChange, teacherNames, onOpen }) {
  const counts = useMemo(() => countLessonsByDay(lessons), [lessons]);
  const dayLessons = useMemo(() => lessonsForDay(lessons, day), [lessons, day]);
  const selectedChip = useRef(null);

  useEffect(() => {
    selectedChip.current?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [day]);

  return (
    <div className={styles.wrap}>
      <div className={styles.days} role="tablist" aria-label="أيام الأسبوع">
        {DAY_NAMES.map((name, i) => {
          const selected = day === i + 1;
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={selected}
              ref={selected ? selectedChip : null}
              className={`${styles.day} ${selected ? styles.daySelected : ""}`}
              onClick={() => onDayChange(i + 1)}
            >
              {name}
              {counts[i] > 0 && <span className={styles.dayCount}>{counts[i]}</span>}
            </button>
          );
        })}
      </div>

      <p className={styles.note}>
        {dayLessons.length
          ? `عدد الدروس: ${dayLessons.length} · حسب الساعة`
          : "لا توجد دروس في هذا اليوم"}
      </p>

      <ul className={styles.list}>
        {dayLessons.map((lesson) => {
          const card = (
            <>
              <span className={styles.name}>{lesson.name}</span>
              <span className={styles.meta}>
                <span className={`${styles.place} ${isNamedPlace(lesson.room) ? styles.placeNamed : ""}`}>
                  {roomLabel(lesson.room)}
                </span>
                {teacherNames?.[lesson.teacher] && <span>{teacherNames[lesson.teacher]}</span>}
                <span>الطلاب: {(lesson.list_students || []).length}</span>
              </span>
            </>
          );

          return (
            <li key={lesson._id} className={styles.row}>
              <span className={styles.time}>
                {toHHMM(startOf(lesson))}
                <small>{toHHMM(endOf(lesson))}</small>
              </span>
              {onOpen ? (
                <button type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => onOpen(lesson)}>
                  {card}
                </button>
              ) : (
                <div className={styles.card}>{card}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
