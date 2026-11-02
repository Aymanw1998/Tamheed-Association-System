import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getUserById, signOutEverywhere, deleteU, changeStatus, unlockUser } from "../../WebServer/services/user/functionsUser.jsx";
import { exportUserPdf } from "../ExportPDF/ExportPDF.jsx";
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
import { useRolePicker, permissionError } from "./RolePickerDialog.jsx";

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
  const { pickRole, roleDialog } = useRolePicker();
  const [user, setUser] = useState(null);
  const [loads, setLoads] = useState(0);
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
  }, [id, loads]);

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
  // Print, unlock, suspend and delete are here, not in the list or the form,
  // and so are approving a waiting account and reactivating a suspended one
  // (owner, 2026-11-02). The server checks every one again.
  const manageable = canManageTargetClient(getStoredViewer(), user);
  const room = user.room || "active";
  const canApprove = manageable && canStored("users.approve");
  const confirm = (title, message) => ask("change", { title, message, confirmText: title }).catch(() => false);
  const unlock = async () => {
    if (!(await confirm(t("perms.unlock"), t("perms.unlockConfirm")))) return;
    const res = await unlockUser(user.tz);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("perms.unlocked"));
    setUser({ ...user, lockedAt: null });
  };
  const suspend = async () => {
    if (!(await confirm(t("record.suspend"), t("record.suspendConfirm")))) return;
    const res = await changeStatus(user.tz, "active", "noActive");
    if (!res?.ok) return toast.warn(res?.message || t("record.suspendFailed"));
    toast.success(t("record.suspended"));
    navigate("/users");
  };
  // Approval assigns a role (the server requires one), and so does
  // reactivating an account that has none. The page reloads, now active.
  const activate = async () => {
    let role;
    if (room === "waiting" || !resolveRole(user)) {
      role = await pickRole(user);
      if (!role) return;
    }
    const res = await changeStatus(user.tz, room, "active", role);
    if (!res?.ok) return toast.error(permissionError(t, res));
    toast.success(t(room === "waiting" ? "perms.approved" : "record.activated"));
    setLoads((n) => n + 1);
  };
  // deleteU asks first; null means it was cancelled.
  const remove = async () => {
    const res = await deleteU(user.tz, room);
    if (!res) return;
    if (!res.ok) return toast.warn(res.message || t("record.deleteFailed"));
    toast.success(t("record.deleted"));
    navigate("/users");
  };
  const actions = [
    room === "waiting" && canApprove && { label: t("record.approve"), onClick: activate, variant: "success", tour: "users-approve" },
    room === "noActive" && canApprove && { label: t("record.activate"), onClick: activate, variant: "success" },
    editable && { label: t("record.edit"), onClick: () => navigate(`/users/${user.tz}/edit`), tour: "user-view-edit" },
    { label: t("record.print"), onClick: () => exportUserPdf(user), tour: "users-pdf" },
    user.lockedAt && manageable && canStored("users.unlock") && { label: t("perms.unlock"), onClick: unlock },
    editable && { label: t("record.signOutAll"), onClick: signOut, variant: "danger" },
    editable && canStored("users.approve") && { label: t("record.suspend"), onClick: suspend, variant: "danger" },
    manageable && canStored("users.delete") && { label: t("record.deleteAccount"), onClick: remove, variant: "danger" },
  ].filter(Boolean);

  const facts = room === "waiting" ? [[t("record.status"), t("record.waiting")]]
    : room === "noActive" ? [[t("record.status"), t("record.suspendedState")]] : undefined;

  return (
    <>
      <RecordPage
        photo={user.photo}
        facts={facts}
        title={nameOf(user) || user.tz}
        subtitle={roleLabel(resolveRole(user))}
        actions={actions}
        tabs={tabs}
      />
      {roleDialog}
    </>
  );
}
