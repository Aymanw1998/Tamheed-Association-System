import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getOne } from "../../WebServer/services/student/functionsStudent.jsx";
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

// A student's read-only page: every detail, their lessons and their
// responsible guide, with edit and print for those allowed.
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
  const actions = [
    canStored("students.edit") && { label: t("record.edit"), onClick: () => navigate(`/students/${s.tz}/edit`), tour: "student-view-edit" },
    canStored("students.view") && { label: t("record.print"), onClick: () => exportStudentPdf(s, s.guide?.name || "") },
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
  ].filter(Boolean);

  // At a glance beside the tabs: the guide, the lessons and, for an
  // attendance.view holder, the rate over the rows sent.
  const rate = Array.isArray(s.attendance) ? attendanceTotals(s.attendance).rate : undefined;
  const facts = [
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
