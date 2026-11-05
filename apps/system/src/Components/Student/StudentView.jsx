import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getOne, deleteS, update } from "../../WebServer/services/student/functionsStudent.jsx";
import { toast } from "../../ALERT/SystemToasts";
import ConsentView from "./ConsentView.jsx";
import { exportStudentPdf } from "../ExportPDF/ExportPDF.jsx";
import { canStored, getStoredUserId } from "../../utils/session";
import { byLessonTime, lessonWhen, guideLink } from "../../utils/recordLinks";
import { useI18n } from "../../i18n/I18nContext";
import RecordPage from "../UI/RecordPage";
import { DetailGroup, LinkList, GuideCard } from "../UI/RecordParts";
import StudentAttendance from "./StudentAttendance";
import { attendanceTotals } from "../../utils/attendanceView";

const dateOf = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB") : "";
};

const ACTIVE_STATUS = "عادي";
const PENDING_STATUS = "ينتظر";

// A student's read-only page: every detail, their lessons and their
// responsible guide, with edit, print and delete for those allowed. Lists
// open this page; the actions are here, not in the list (owner, 2026-11-02),
// approving or rejecting a waiting request and activating an inactive
// student included.
export default function StudentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [student, setStudent] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setStudent(null);
    setError("");
    (async () => {
      const s = await getOne(id);
      if (!alive) return;
      if (!s.ok) { setError(s.message || "تعذّر تحميل الطالب"); return; }
      setStudent(s.student);
    })();
    return () => { alive = false; };
  }, [id]);

  // The server sends the student's lessons: all of them to an admin and to the
  // responsible guide (owner, 2026-11-01), otherwise the user's own lessons.
  const mine = useMemo(() => [...(student?.lessons || [])].sort(byLessonTime), [student]);

  if (!student) return <RecordPage loading={!error} error={error} />;

  const s = student;
  // deleteS asks first; null means it was cancelled.
  const remove = async () => {
    const res = await deleteS(s.tz);
    if (!res) return;
    if (!res.ok) return toast.warn(res.message || t("record.deleteFailed"));
    toast.success(t("record.deleted"));
    navigate("/students");
  };
  const status = String(s.status || "").trim() || ACTIVE_STATUS;
  const waiting = status === PENDING_STATUS;
  // update asks first; null means it was cancelled. The student stays on the
  // page, now active.
  const activate = async () => {
    const res = await update(s.tz, { status: ACTIVE_STATUS });
    if (!res) return;
    if (!res.ok) return toast.warn(res.message || t(waiting ? "record.approveFailed" : "record.activateFailed"));
    toast.success(t(waiting ? "record.approvedStudent" : "record.activated"));
    setStudent({ ...s, status: ACTIVE_STATUS });
  };
  const canEdit = canStored("students.edit");
  const actions = [
    waiting && canEdit && { label: t("record.approve"), onClick: activate, variant: "success", tour: "students-approve" },
    !waiting && status !== ACTIVE_STATUS && canEdit && { label: t("record.activate"), onClick: activate, variant: "success" },
    canEdit && { label: t("record.edit"), onClick: () => navigate(`/students/${s.tz}/edit`), tour: "student-view-edit" },
    canStored("students.view") && { label: t("record.print"), onClick: () => exportStudentPdf(s, s.guide?.name || "") },
    waiting && canStored("students.delete") && { label: t("record.reject"), onClick: remove, variant: "danger", tour: "students-reject" },
    !waiting && canStored("students.delete") && { label: t("record.delete"), onClick: remove, variant: "danger", tour: "student-delete" },
  ].filter(Boolean);

  const tabs = [
    {
      id: "personal",
      label: t("record.personal"),
      content: (
        <>
          <DetailGroup title="بيانات الطالب" rows={[
            ["رقم الهوية", s.tz], ["الاسم الشخصي", s.firstname], ["اسم العائلة", s.lastname],
            ["تاريخ الميلاد", dateOf(s.birth_date)], ["الجنس", s.gender],
          ]} />
          <DetailGroup title="السكن والتواصل" rows={[
            ["مدينة السكن", s.city], ["شارع السكن", s.street], ["الهاتف", s.phone], ["البريد الإلكتروني", s.email],
          ]} />
          <DetailGroup title="الدراسة" rows={[["المدرسة", s.school], ["الصف", s.layer]]} />
          <DetailGroup title="الأهل" rows={[
            ["الأب", s.father_name], ["هاتف الأب", s.father_phone], ["عمل الأب", s.father_work],
            ["الأم", s.mother_name], ["هاتف الأم", s.mother_phone], ["عمل الأم", s.mother_work],
          ]} />
          <DetailGroup title="الصحة والملاحظات" rows={[["الحالة الصحية", s.health_status], ["ملاحظات", s.notes]]} />
        </>
      ),
    },
    {
      id: "lessons",
      label: t("record.lessons"),
      content: (
        <LinkList
          empty={t("record.noLessons")}
          items={mine.map((l) => ({ key: l._id, to: `/lessons/${l._id}`, name: l.name, meta: `${lessonWhen(l)}${l.room ? ` · ${l.room}` : ""}` }))}
        />
      ),
    },
    // The student's attendance, read-only, newest first: sent only to an
    // attendance.view holder (all rows to an admin and to the responsible
    // guide, owner 2026-11-01, otherwise the rows of the user's own lessons).
    Array.isArray(s.attendance) && {
      id: "attendance",
      label: t("record.attendance"),
      content: <StudentAttendance rows={s.attendance} />,
    },
    {
      id: "guide",
      label: t("record.guide"),
      content: <GuideCard contact={s.guide} to={guideLink(s.guide, getStoredUserId(), s.main_teacher)} empty={t("record.noGuide")} />,
    },
    canStored("students.parentLink") && {
      id: "consent",
      label: "التوقيع",
      content: <ConsentView studentId={s._id} />,
    },
  ].filter(Boolean);

  // At a glance beside the tabs: the guide, the lessons and, for an
  // attendance.view holder, the rate over the rows sent.
  const rate = Array.isArray(s.attendance) ? attendanceTotals(s.attendance).rate : undefined;
  const facts = [
    status !== ACTIVE_STATUS && [t("record.status"), status],
    [t("record.guide"), s.guide?.name || "—"],
    [t("record.lessons"), String(mine.length)],
    rate !== undefined && [t("record.attendanceRate"), rate === null ? "—" : `${rate}%`],
  ].filter(Boolean);

  return (
    <RecordPage
      photo={s.photo}
      facts={facts}
      title={`${s.firstname || ""} ${s.lastname || ""}`.trim() || s.tz}
      subtitle={[s.layer, s.school].filter(Boolean).join(" · ")}
      actions={actions}
      tabs={tabs}
    />
  );
}
