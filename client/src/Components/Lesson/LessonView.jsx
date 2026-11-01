import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getOneLesson, getAllLesson, addToList, removeFromList } from "../../WebServer/services/lesson/functionsLesson.jsx";
import { getAll as getStudents } from "../../WebServer/services/student/functionsStudent.jsx";
import { ask } from "../Provides/confirmBus";
import { toast } from "../../ALERT/SystemToasts";
import { canStored, getStoredUserId } from "../../utils/session";
import { lessonWhen, guideLink } from "../../utils/recordLinks";
import { toHHMM, endOf } from "../../utils/lessonSchedule";
import { roomLabel } from "../../utils/rooms";
import { useI18n } from "../../i18n/I18nContext";
import RecordPage from "../UI/RecordPage";
import { DetailGroup, GuideCard } from "../UI/RecordParts";
import LessonRoster from "./LessonRoster";
import withLock from "../../locks/withLock";

const nameOf = (s) => `${s?.firstname || ""} ${s?.lastname || ""}`.trim();

// A lesson's read-only page: its details, and its students, which a
// lessons.roster holder can add and remove here (each change is saved at once
// through the roster endpoints, which respect the lesson's lock). Changes
// run one after another: each endpoint rewrites the whole roster, so two at
// once could drop one. Each change also takes the lesson's lock for its
// write, so another tab, another user or an open edit form is never
// overwritten (their lock answers 423 and nothing is written). An answer for
// a lesson no longer shown is dropped.
export default function LessonView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [lesson, setLesson] = useState(null);
  const [allLessons, setAllLessons] = useState([]);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState("");
  const shownId = useRef(id);
  const queue = useRef(Promise.resolve());
  const studentsLoad = useRef(0);
  // Set once «تعديل» is clicked: the roster takes no more changes, so nothing
  // is written behind the form. Cleared when the page shows another lesson.
  const leaving = useRef(false);
  const [opening, setOpening] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const reload = useCallback(async () => {
    const res = await getOneLesson(id);
    if (shownId.current !== id) return; // the page moved on to another lesson
    if (!res.ok) { setError(res.message || "تعذّر تحميل الدرس"); return; }
    setLesson(res.lesson);
  }, [id]);

  // Only the latest student load is shown (an older, slower answer is dropped).
  const loadStudents = useCallback(() => {
    const mine = ++studentsLoad.current;
    return getStudents().then((r) => { if (mine === studentsLoad.current) setStudents(r.ok ? r.students : []); });
  }, []);

  useEffect(() => {
    shownId.current = id;
    leaving.current = false;
    setOpening(false);
    setLesson(null);
    setError("");
    reload();
    getAllLesson().then((r) => setAllLessons(r.ok ? r.lessons : []));
    loadStudents();
  }, [id, reload, loadStudents]);

  // Saves one roster change after the ones before it, then shows the lesson
  // (and the students, as a student added by ID may have become visible).
  // `forId` is the lesson the change was made on: a confirmation answered
  // after the page moved to another lesson (or closed) writes nothing.
  const apply = (call, forId = id) => {
    if (leaving.current || !mounted.current || shownId.current !== forId) return Promise.resolve(false);
    const run = queue.current.then(async () => {
      const res = await withLock(`lesson:${id}`, call).catch((err) => ({
        ok: false,
        message: err?.response?.data?.message || err?.message,
      }));
      if (!res.ok) toast.warn(res.message || "تعذّر حفظ التغيير");
      await Promise.all([reload(), res.ok ? loadStudents() : null]);
      return res.ok;
    });
    queue.current = run.catch(() => false);
    return run;
  };

  const onChange = async (ids) => {
    const before = (lesson.list_students || []).map(String);
    const added = ids.filter((x) => !before.includes(x));
    const removed = before.filter((x) => !ids.includes(x));
    // Resolves true when every write succeeded (the roster counts additions then).
    const runs = [];
    if (added.length) runs.push(apply(() => addToList(id, { list_students: added })));
    if (removed.length) runs.push(apply(() => removeFromList(id, removed)));
    return (await Promise.all(runs)).every(Boolean);
  };

  // The form takes the same lock this page's writes take; it opens only after
  // they (and their lock release) are done, so no release lands under it.
  // Changes made after the click are waited for too: drain until no new one came.
  const openForm = async () => {
    leaving.current = true;
    setOpening(true);
    let pending;
    do {
      pending = queue.current;
      await pending;
    } while (pending !== queue.current);
    // The user may have gone elsewhere meanwhile: never pull them back.
    if (!mounted.current || shownId.current !== id) return;
    navigate(`/lessons/${id}/edit`);
  };

  const confirmRemove = (student) =>
    ask("delete", { title: "إزالة طالب", message: t("record.removeConfirm").replace("{name}", nameOf(student)) }).catch(() => false);

  if (!lesson) return <RecordPage loading={!error} error={error} />;

  const viewer = getStoredUserId();
  const actions = canStored("lessons.edit") ? [{ label: t("record.edit"), onClick: openForm, tour: "lesson-view-edit" }] : [];

  const tabs = [
    {
      id: "details",
      label: t("record.lessonDetails"),
      content: (
        <>
          <DetailGroup rows={[
            ["اسم الدرس", lesson.name],
            ["الموعد", `${lessonWhen(lesson)} – ${toHHMM(endOf(lesson))}`],
            ["المكان", roomLabel(lesson.room)],
          ]} />
          <GuideCard label="المرشد" contact={lesson.teacherContact} to={guideLink(lesson.teacherContact, viewer, lesson.teacher)} empty="—" />
          {lesson.helperContact && (
            <GuideCard label="المساعد" contact={lesson.helperContact} to={guideLink(lesson.helperContact, viewer, lesson.helper)} empty="—" />
          )}
        </>
      ),
    },
    {
      id: "students",
      label: t("record.students"),
      content: (
        <LessonRoster
          lesson={lesson}
          students={students}
          allLessons={allLessons}
          canEdit={canStored("lessons.roster") && !opening}
          hiddenCount={lesson.hiddenCount}
          onChange={onChange}
          onLookupAdd={(student) => apply(() => addToList(id, { list_tz: [student.tz] }))}
          linkOf={(student) => `/students/${student.tz}`}
          confirmRemove={confirmRemove}
        />
      ),
    },
  ];

  return (
    <RecordPage
      photo={null}
      title={lesson.name}
      subtitle={`${lessonWhen(lesson)} · ${roomLabel(lesson.room)}`}
      actions={actions}
      tabs={tabs}
    />
  );
}
