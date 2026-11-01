import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getUserById, signOutEverywhere } from "../../WebServer/services/user/functionsUser.jsx";
import { ask } from "../Provides/confirmBus";
import { toast } from "../../ALERT/SystemToasts";
import { getAll as getStudents } from "../../WebServer/services/student/functionsStudent.jsx";
import { getAllLesson } from "../../WebServer/services/lesson/functionsLesson.jsx";
import { canStored, getStoredViewer } from "../../utils/session";
import { guideStudents, guideLessons, lessonWhen } from "../../utils/recordLinks";
import { canManageTargetClient, resolveRole, roleLabel } from "../../utils/roles";
import { useI18n } from "../../i18n/I18nContext";
import RecordPage from "../UI/RecordPage";
import { DetailGroup, LinkList } from "../UI/RecordParts";

const nameOf = (p) => `${p?.firstname || ""} ${p?.lastname || ""}`.trim();
const dateOf = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB") : "";
};

// The personal details shown for a user (here and in the profile's tabs).
export const userDetails = (u) => [
  ["رقم الهوية", u.tz], ["الاسم", nameOf(u)], ["الدور", roleLabel(resolveRole(u))],
  ["تاريخ الميلاد", dateOf(u.birth_date)], ["الجنس", u.gender],
  ["الهاتف", u.phone], ["البريد الإلكتروني", u.email], ["مدينة السكن", u.city], ["شارع السكن", u.street],
];

// The students and lessons tabs of a user; a tab with nothing in it is left out.
export const guideTabs = ({ students, lessons, studentsLabel, lessonsLabel }) => [
  students.length > 0 && {
    id: "students",
    label: studentsLabel,
    content: <LinkList empty="" items={students.map((s) => ({ key: s._id, to: `/students/${s.tz}`, name: nameOf(s), meta: s.layer }))} />,
  },
  lessons.length > 0 && {
    id: "lessons",
    label: lessonsLabel,
    content: <LinkList empty="" items={lessons.map((l) => ({ key: l._id, to: `/lessons/${l._id}`, name: l.name, meta: lessonWhen(l) }))} />,
  },
].filter(Boolean);

// A user's read-only page (reached from the users list): details, and the
// students they are responsible for and the lessons they teach, when any.
export default function UserView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [user, setUser] = useState(null);
  const [students, setStudents] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setUser(null);
    setError("");
    (async () => {
      const [u, s, l] = await Promise.all([getUserById(id), getStudents(), getAllLesson()]);
      if (!alive) return;
      if (!u.ok) { setError(u.message || "تعذّر تحميل المستخدم"); return; }
      setUser(u.user);
      setStudents(s.ok ? s.students : []);
      setLessons(l.ok ? l.lessons : []);
    })();
    return () => { alive = false; };
  }, [id]);

  const theirs = useMemo(() => ({
    students: user ? guideStudents(students, user._id) : [],
    lessons: user ? guideLessons(lessons, user._id) : [],
  }), [user, students, lessons]);

  if (!user) return <RecordPage loading={!error} error={error} />;

  const tabs = [
    { id: "personal", label: t("record.personal"), content: <DetailGroup rows={userDetails(user)} /> },
    ...guideTabs({ ...theirs, studentsLabel: t("record.theirStudents"), lessonsLabel: t("record.theirLessons") }),
  ];
  // Like the users list: only an active account the viewer may manage (lower
  // rank, not themself); the form edits active accounts only.
  const editable = canStored("users.edit") && user.room !== "waiting" && user.room !== "noActive"
    && canManageTargetClient(getStoredViewer(), user);
  // A user stays signed in until he signs out or is signed out here (owner,
  // 2026-11-01): every device at once.
  const signOut = async () => {
    const ok = await ask("change", {
      title: t("record.signOutAll"), message: t("record.signOutAllConfirm"), confirmText: t("record.signOutAll"),
    }).catch(() => false);
    if (!ok) return;
    const res = await signOutEverywhere(user.tz);
    if (!res.ok) return toast.warn(res.message || t("record.signOutAllFailed"));
    toast.success(t("record.signedOutAll"));
  };
  const actions = editable ? [
    { label: t("record.edit"), onClick: () => navigate(`/users/${user.tz}/edit`), tour: "user-view-edit" },
    { label: t("record.signOutAll"), onClick: signOut, variant: "danger" },
  ] : [];

  return (
    <RecordPage
      photo={user.photo}
      title={nameOf(user) || user.tz}
      subtitle={roleLabel(resolveRole(user))}
      actions={actions}
      tabs={tabs}
    />
  );
}
