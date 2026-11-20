import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getOne, deleteS, update } from "../../WebServer/services/student/functionsStudent.jsx";
import { toast } from "../../ALERT/SystemToasts";
import ConsentView from "./ConsentView.jsx";
import GuidePickerDialog from "./GuidePickerDialog.jsx";
import MakeStaffDialog from "./MakeStaffDialog.jsx";
import { exportStudentPdf } from "../ExportPDF/ExportPDF.jsx";
import { canStored, getStoredUserId } from "../../utils/session";
import { byLessonTime, lessonWhen, guideLink } from "../../utils/recordLinks";
import { useI18n } from "../../i18n/I18nContext";
import RecordPage from "../UI/RecordPage";
import { DetailGroup, LinkList, GuideCard } from "../UI/RecordParts";
import StudentAttendance from "./StudentAttendance";
import { attendanceTotals } from "../../utils/attendanceView";
import { offerUndo } from "../../utils/undoDelete";
import { gradeLabel } from "../../utils/grades";

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
  const [pickGuide, setPickGuide] = useState(false);
  const [makingStaff, setMakingStaff] = useState(false);
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [student, setStudent] = useState(null);
  const [error, setError] = useState("");

  // Read again after a conversion call that did not finish: its phase, banner
  // and buttons change on the server (testing review, 2026-11-20).
  const refresh = async () => {
    const s = await getOne(id);
    if (s.ok) setStudent(s.student);
  };
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
  // Asks first (null: cancelled), then «سلة المحذوفات» with "تراجع" for 8 seconds.
  const remove = async () => {
    const res = await deleteS(s.tz);
    if (!res) return;
    if (!res.ok) return toast.warn(res.message || t("record.deleteFailed"));
    offerUndo({ trashId: res.trashId, message: t("record.movedToTrash"), onRestored: () => navigate(`/students/${s.tz}`) });
    navigate("/students");
  };
  const status = String(s.status || "").trim() || ACTIVE_STATUS;
  const waiting = status === PENDING_STATUS;
  // update asks first; null means it was cancelled. The student stays on the
  // page, now active.
  const activate = async () => {
    // A request with no responsible guide asks for one first.
    if (waiting && !s.main_teacher && canStored("students.viewAll") && canStored("users.view")) {
      setPickGuide(true);
      return;
    }
    await approveWith({});
  };
  const approveWith = async (extra) => {
    const res = await update(s.tz, { status: ACTIVE_STATUS, ...extra });
    if (!res) return;
    if (!res.ok) return toast.warn(res.message || t(waiting ? "record.approveFailed" : "record.activateFailed"));
    toast.success(t(waiting ? "record.approvedStudent" : "record.activated"));
    setStudent({ ...s, ...extra, status: ACTIVE_STATUS });
  };
  // A student who became staff (owner, 2026-11-19): archived, read-only.
  // One whose conversion stopped half way is finished from here.
  const archived = Boolean(s.archivedAt);
  const converting = Boolean(s.staffConversion) && s.staffConversion.phase !== "done";
  const mayMakeStaff = canStored("students.makeStaff") && canStored("users.create");
  const canEdit = canStored("students.edit") && !archived && !converting;
  const actions = [
    mayMakeStaff && !archived && !converting && !waiting && status === ACTIVE_STATUS && { label: "تحويل إلى الطاقم", onClick: () => setMakingStaff(true) },
    mayMakeStaff && converting && { label: "إكمال التحويل", onClick: () => setMakingStaff(true), variant: "success" },
    waiting && canEdit && { label: t("record.approve"), onClick: activate, variant: "success", tour: "students-approve" },
    !waiting && status !== ACTIVE_STATUS && canEdit && { label: t("record.activate"), onClick: activate, variant: "success" },
    canEdit && { label: t("record.edit"), onClick: () => navigate(`/students/${s.tz}/edit`), tour: "student-view-edit" },
    canStored("students.view") && { label: t("record.print"), onClick: () => exportStudentPdf(s, s.guide?.name || "") },
    waiting && canStored("students.delete") && { label: t("record.reject"), onClick: remove, variant: "danger", tour: "students-reject" },
    !waiting && !archived && !converting && canStored("students.delete") && { label: t("record.delete"), onClick: remove, variant: "danger", tour: "student-delete" },
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
          <DetailGroup title="الدراسة" rows={[["المدرسة", s.school], ["الصف", gradeLabel(s)]]} />
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
    canStored("consents.view") && {
      id: "consent",
      label: "التوقيع",
      content: <ConsentView studentId={s._id} readOnly={Boolean(s.archivedAt || s.staffConversion)} />,
    },
  ].filter(Boolean);

  // At a glance beside the tabs: the guide, the lessons and, for an
  // attendance.view holder, the rate over the rows sent.
  const rate = Array.isArray(s.attendance) ? attendanceTotals(s.attendance).rate : undefined;
  const facts = [
    !s.consentAt && ["التوقيع", "متبقٍ توقيع ولي الأمر"],
    status !== ACTIVE_STATUS && [t("record.status"), status],
    [t("record.guide"), s.guide?.name || "—"],
    [t("record.lessons"), String(mine.length)],
    rate !== undefined && [t("record.attendanceRate"), rate === null ? "—" : `${rate}%`],
  ].filter(Boolean);

  return (
    <>
    {makingStaff && <MakeStaffDialog student={s} onClose={() => setMakingStaff(false)} onFailed={refresh} onDone={(res) => {
      setMakingStaff(false);
      toast.success(res.photoCopied === false ? "صار من الطاقم. لم تُنسخ الصورة، يمكن رفعها من صفحته." : "صار من الطاقم");
      navigate(`/users/${s.tz}`);
    }} />}
    {archived && (
      <p role="status" style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: 8, background: "var(--info-bg, #eef5ff)", border: "1px solid var(--info-border, #b9d3f5)", color: "var(--info-text, #1d3d66)" }}>
        أصبح من الطاقم في {dateOf(s.staffConversion?.doneAt || s.archivedAt)}. هذا سجله كطالب، للقراءة فقط.{" "}
        {canStored("users.view") && <Link to={`/users/${s.tz}`}>صفحته في الطاقم</Link>}
      </p>
    )}
    {converting && (
      <p role="status" style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: 8, background: "var(--warn-bg, #fff6e5)", border: "1px solid var(--warn-border, #f0c36d)", color: "var(--warn-text, #6b4a00)" }}>التحويل إلى الطاقم لم يكتمل. {mayMakeStaff ? "اضغط «إكمال التحويل»." : "اطلب من المدير إكماله."}</p>
    )}
    {pickGuide && <GuidePickerDialog student={s} onClose={() => setPickGuide(false)} onPick={(guide) => { setPickGuide(false); approveWith({ main_teacher: guide }); }} />}
    <RecordPage
      photo={s.photo}
      facts={facts}
      title={`${s.firstname || ""} ${s.lastname || ""}`.trim() || s.tz}
      subtitle={[gradeLabel(s), s.school].filter(Boolean).join(" · ")}
      actions={actions}
      tabs={tabs}
    />
    </>
  );
}
