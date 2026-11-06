import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addTask, assignTask, editTask, getTaskBoard, removeTask, unassignTask } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { ask } from "../Provides/confirmBus.js";
import Button from "../UI/Button.jsx";
import RequiredMark from "../UI/RequiredMark";
import GreetingDialog from "./GreetingDialog";
import { setUnsavedChanges } from "../../utils/unsavedChanges";
import styles from "./WeeklyTasks.module.css";

// Two parts: the tasks, and the groups they belong to. A task joins a group by pressing
// it and then the group, or on a computer by dragging it onto the group.
export default function ManageWeeklyTasks() {
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ title: "", details: "" });
  const [editing, setEditing] = useState(null); // { id, title, details }
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);
  const [greeting, setGreeting] = useState(false);
  useEffect(() => {
    const original = editing && board?.tasks.find((task) => task.id === editing.id);
    const changed = Boolean(draft.title || draft.details || (editing && original &&
      (editing.title !== original.title || editing.details !== original.details)));
    setUnsavedChanges(changed);
    return () => setUnsavedChanges(null);
  }, [draft, editing, board]);

  const load = useCallback(async () => {
    const res = await getTaskBoard();
    if (res.ok) { setBoard(res); setError(""); } else setError(res.message);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (request) => {
    const res = await request();
    if (!res.ok) { toast.warn(res.message); return false; }
    await load();
    return true;
  };

  const create = async (event) => {
    event.preventDefault();
    setSaving(true);
    const done = await run(() => addTask(draft));
    setSaving(false);
    if (done) setDraft({ title: "", details: "" });
  };
  const saveEdit = async () => {
    const done = await run(() => editTask(editing.id, editing));
    if (done) setEditing(null);
  };
  const remove = async (task) => {
    let confirmed = false;
    try {
      confirmed = await ask("", { title: "حذف مهمة", message: `حذف «${task.title}» من كل المجموعات؟`, confirmText: "حذف", cancelText: "إلغاء", danger: true });
    } catch {
      return;
    }
    if (!confirmed) return;
    await run(() => removeTask(task.id));
    if (picked === task.id) setPicked("");
  };
  const join = async (taskId, guideId) => {
    if (taskId) await run(() => assignTask(taskId, guideId));
  };

  if (error && !board) return <div className={styles.page} dir="rtl"><div role="alert" className={styles.error}>{error}</div></div>;
  if (!board) return <div className={styles.page} role="status">جارٍ التحميل…</div>;

  const pickedTask = board.tasks.find((task) => task.id === picked);
  return (
    <div className={styles.page} dir="rtl">
      {greeting && <GreetingDialog guides={board.guides} defaultText={board.defaultGreeting} onClose={() => setGreeting(false)} />}
      <header className={styles.head}>
        <h1>تعديل المهمات والمجموعات</h1>
        <Button disabled={!board.guides.length} onClick={() => setGreeting(true)}>إرسال بركة</Button>
        <Button variant="secondary" onClick={() => navigate("/weekly-tasks")}>العودة إلى المهمات</Button>
      </header>

      <section className={styles.panel} aria-label="المهمات">
        <h2>المهمات</h2>
        <form className={styles.form} onSubmit={create}>
          <label htmlFor="task-title">اسم المهمة<RequiredMark /></label>
          <input id="task-title" maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <label htmlFor="task-details">تفاصيل</label>
          <input id="task-details" maxLength={500} value={draft.details} onChange={(event) => setDraft({ ...draft, details: event.target.value })} />
          <div><Button type="submit" loading={saving} disabled={!draft.title.trim()}>إضافة مهمة</Button></div>
        </form>
        {board.tasks.length === 0 && <p className={styles.muted}>لا توجد مهمات بعد.</p>}
        <ul className={styles.list}>
          {board.tasks.map((task) => (
            <li
              key={task.id}
              className={`${styles.item} ${picked === task.id ? styles.picked : ""}`}
              draggable={!editing}
              onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
            >
              {editing?.id === task.id ? (
                <span className={styles.form}>
                  <input aria-label="اسم المهمة" maxLength={120} value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
                  <input aria-label="تفاصيل" maxLength={500} value={editing.details} onChange={(event) => setEditing({ ...editing, details: event.target.value })} />
                  <span className={styles.row}>
                    <Button size="sm" onClick={saveEdit}>حفظ</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>إلغاء</Button>
                  </span>
                </span>
              ) : (
                <>
                  <button type="button" className={styles.pick} aria-pressed={picked === task.id} onClick={() => setPicked(picked === task.id ? "" : task.id)}>
                    <strong dir="auto">{task.title}</strong>
                    {task.details && <small dir="auto">{task.details}</small>}
                  </button>
                  <span className={styles.row}>
                    <Button size="sm" variant="secondary" onClick={() => setEditing({ ...task })}>تعديل</Button>
                    <Button size="sm" variant="danger" onClick={() => remove(task)}>حذف</Button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel} aria-label="المجموعات">
        <h2>المجموعات</h2>
        <p className={styles.muted}>
          {pickedTask ? `اضغط على مجموعة لربطها بـ«${pickedTask.title}».` : "اختر مهمة ثم اضغط على مجموعة، أو اسحبها إليها من الحاسوب. تبقى المهمات لمجموعاتها كل أسبوع إلى أن تغيّرها."}
        </p>
        {board.groups.length === 0 && <p className={styles.muted}>لا توجد برامج لها مسؤولون نشطون بعد.</p>}
        <div className={styles.groups}>
          {board.groups.map((guide) => {
            const joined = board.assignments.filter((row) => row.groupId === guide.id);
            return (
              <div
                key={guide.id}
                className={`${styles.group} ${picked ? styles.groupTarget : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); join(event.dataTransfer.getData("text/plain"), guide.id); }}
              >
                <button type="button" className={styles.groupHead} disabled={!picked} onClick={() => join(picked, guide.id)}>
                  <h3 dir="auto">{guide.name}</h3>
                  <small dir="auto">{guide.ownerNames?.join("، ")}</small>
                </button>
                <ul className={styles.chips}>
                  {joined.map((row) => {
                    const task = board.tasks.find((item) => item.id === row.taskId);
                    return task && (
                      <li key={row.taskId} className={styles.chip}>
                        <span dir="auto">{task.title}</span>
                        <button type="button" aria-label={`إزالة ${task.title} من ${guide.name}`} onClick={() => run(() => unassignTask(row.taskId, guide.id))}>×</button>
                      </li>
                    );
                  })}
                  {joined.length === 0 && <li className={styles.muted}>لا مهمات</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
