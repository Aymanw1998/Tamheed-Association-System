import React, { useEffect, useMemo, useState } from "react";
import Profile from "./Profile";
import { getAll as getStudents } from "../../WebServer/services/student/functionsStudent.jsx";
import { getAllLesson } from "../../WebServer/services/lesson/functionsLesson.jsx";
import { canStored, getStoredUserId } from "../../utils/session";
import { guideStudents, guideLessons } from "../../utils/recordLinks";
import { useI18n } from "../../i18n/I18nContext";
import { RecordTabs } from "../UI/RecordPage";
import { guideTabs } from "../User/UserView";
import styles from "../UI/RecordPage.module.css";

// The signed-in user's own page: the profile form, plus "my students" and
// "my lessons" tabs when there are any. With neither, the form shows alone,
// without a tab bar. The form keeps one place in the tree from the first
// render, so it is never rebuilt (losing typed edits) when the tabs arrive or
// while another tab is open.
export default function ProfilePage(props) {
  const { t } = useI18n();
  const [students, setStudents] = useState([]);
  const [lessons, setLessons] = useState([]);

  useEffect(() => {
    let alive = true;
    if (canStored("students.view")) getStudents().then((r) => alive && setStudents(r.ok ? r.students : []));
    if (canStored("lessons.view")) getAllLesson().then((r) => alive && setLessons(r.ok ? r.lessons : []));
    return () => { alive = false; };
  }, []);

  const me = getStoredUserId();
  const extra = useMemo(() => guideTabs({
    students: guideStudents(students, me),
    lessons: guideLessons(lessons, me),
    studentsLabel: t("record.myStudents"),
    lessonsLabel: t("record.myLessons"),
  }), [students, lessons, me, t]);

  const form = <Profile {...props} />;

  return (
    <div className={styles.profileTabs} dir="rtl">
      <RecordTabs keepMounted tabs={[{ id: "details", label: t("record.myDetails"), content: form }, ...extra]} />
    </div>
  );
}
