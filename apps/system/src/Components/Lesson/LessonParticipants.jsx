import React, { useMemo, useState } from "react";
import Button from "../UI/Button";
import EmptyState from "../UI/EmptyState";
import Icon from "../UI/Icon";
import { addUsers, removeUsers, getAddableUsers } from "../../WebServer/services/lesson/functionsLesson.jsx";
import styles from "./LessonParticipants.module.css";

// Users (staff) taking part in a lesson (owner, 2026-11-09). Everyone who
// sees the lesson sees the names; a lessons.staffRoster holder (canEdit) adds
// and removes them. Every write goes through `apply`, the lesson page's queued
// writer that takes the lesson's lock and reloads the lesson afterwards, and
// that shows the server's refusal (for example the lesson's own guide).
// confirmRemove(user) resolves true to go ahead with a removal.
const REASONS = {
  STAFF: "مرشد أو مساعد هذا البرنامج",
  ON_LESSON: "مشارك بالفعل",
};

const normalize = (text) => String(text || "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase().trim();

export default function LessonParticipants({ lessonId, participants = [], canEdit, apply, confirmRemove }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(null);

  const loadCandidates = async () => {
    const res = await getAddableUsers(lessonId);
    setCandidates(res.ok ? res.users : []);
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setQuery("");
    setCandidates(null);
    await loadCandidates();
  };

  const add = async (user) => {
    setBusy(user._id);
    const ok = await apply(() => addUsers(lessonId, [user._id]));
    setBusy(null);
    // Joined: mark him here too, so the list need not reload.
    if (ok) setCandidates((list) => (list || []).map((u) => (u._id === user._id ? { ...u, reason: "ON_LESSON" } : u)));
  };

  const remove = async (user) => {
    if (!(await confirmRemove(user))) return;
    setBusy(user._id);
    await apply(() => removeUsers(lessonId, [user._id]));
    setBusy(null);
    if (pickerOpen) loadCandidates();
  };

  const shown = useMemo(() => {
    const q = normalize(query);
    return (candidates || []).filter((u) => !q || normalize(u.name).includes(q));
  }, [candidates, query]);

  return (
    <section className={styles.wrap} aria-label="الموظفون المشاركون">
      {participants.length ? (
        <ul className={styles.list}>
          {participants.map((user, i) => (
            <li key={user._id} className={`${styles.row} rise-in`} style={{ "--i": i }}>
              <span className={styles.avatar} aria-hidden="true"><Icon name="users" size={18} /></span>
              <span className={styles.name}>{user.name}</span>
              <span className={styles.badge}>موظف</span>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => remove(user)} loading={busy === user._id}>
                  إزالة
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon="users" title="لا يشارك موظفون في هذا البرنامج"
          hint={canEdit ? "أضف موظفًا من الطاقم ليُسجَّل حضوره مع الطلاب." : undefined} />
      )}

      {canEdit && !pickerOpen && (
        <Button variant="secondary" onClick={openPicker} className={styles.addButton}>
          <Icon name="plus" size={18} /> إضافة موظف
        </Button>
      )}

      {canEdit && pickerOpen && (
        <div className={styles.picker}>
          <div className={styles.pickerHead}>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث باسم الموظف…" aria-label="البحث عن موظف" className={styles.search} />
            <Button variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>إغلاق</Button>
          </div>
          {candidates === null ? (
            <p className={styles.note} role="status">جارٍ تحميل الطاقم…</p>
          ) : shown.length ? (
            <div className={styles.options}>
              {shown.map((user) => (
                <button key={user._id} type="button" data-user-option className={styles.option}
                  disabled={Boolean(user.reason) || busy === user._id} onClick={() => add(user)}>
                  <span className={styles.optionName}>{user.name}</span>
                  {user.reason ? <span className={styles.reason}>{REASONS[user.reason] || ""}</span>
                    : <span className={styles.plus} aria-hidden="true"><Icon name="plus" size={16} /></span>}
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.note}>لا يوجد موظف بهذا الاسم.</p>
          )}
        </div>
      )}
    </section>
  );
}
