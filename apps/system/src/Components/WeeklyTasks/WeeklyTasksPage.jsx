import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { approveTask, getMyTasks, getTaskBoard, setMyTaskDone } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { canStored } from "../../utils/session";
import Button from "../UI/Button.jsx";
import styles from "./WeeklyTasks.module.css";

const TaskCheck = ({ checked, disabled, label, onChange }) => (
  <label className={styles.check}>
    <input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={(event) => onChange(event.target.checked)} />
  </label>
);

const weekLabel = (week) => {
  const [y, m, d] = String(week || "").split("-");
  return y ? `${d}/${m}/${y}` : "";
};

// What the person himself must do this week: to do, then done in green.
function MyTasks({ tasks, onToggle, busy }) {
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const groups = [...new Map(tasks.map((task) => [String(task.groupId), task.groupName])).entries()];
  const selectedGroup = groups.some(([id]) => id === group) ? group : "";
  const query = search.trim().toLocaleLowerCase();
  const filtered = tasks.filter((task) => (!selectedGroup || String(task.groupId) === selectedGroup)
    && (!query || `${task.title || ""} ${task.groupName || ""}`.toLocaleLowerCase().includes(query)));
  const open = filtered.filter((task) => !task.done);
  const done = filtered.filter((task) => task.done);
  return (
    <section className={styles.panel} aria-label="مهماتي">
      <h2>مهمات مجموعتي هذا الأسبوع</h2>
      <p className={styles.muted}>أكّد إنجاز المهمات حتى نهاية يوم السبت. يبدأ أسبوع جديد بعد ذلك، وتُغلق مهمات الأسبوع السابق.</p>
      <div className={styles.filters}>
        {groups.length > 1 && <label>المجموعة<select value={selectedGroup} onChange={(event) => setGroup(event.target.value)}><option value="">كل مجموعاتي</option>{groups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
        <label>بحث في مهماتي<input type="search" placeholder="اسم مجموعة أو مهمة" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {(selectedGroup || search) && <Button variant="secondary" onClick={() => { setGroup(""); setSearch(""); }}>مسح الفلتر</Button>}
      </div>
      {filtered.length === 0 ? <p className={styles.muted}>لا توجد مهمات مطابقة.</p> : open.length === 0 && <p className={styles.muted}>كل المهمات المعروضة منجزة.</p>}
      <ul className={styles.list}>
        {open.map((task) => (
          <li key={`${task.groupId}:${task.taskId}`} className={styles.item}>
            <span className={styles.text}><strong dir="auto">{task.title}</strong><small dir="auto">{task.groupName}</small>{task.details && <small dir="auto">{task.details}</small>}</span>
            <TaskCheck checked={false} disabled={busy === `${task.groupId}:${task.taskId}`} label={`إنجاز ${task.title} — ${task.groupName}`} onChange={(checked) => onToggle(task, checked)} />
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <>
          <h3 className={styles.doneTitle}>تم إنجازها</h3>
          <ul className={styles.list}>
            {done.map((task) => (
              <li key={`${task.groupId}:${task.taskId}`} className={`${styles.item} ${styles.done}`}>
                <span className={styles.text}><strong dir="auto">{task.title}</strong><small dir="auto">{task.groupName}</small>{task.approved && <small>أكّدتها الإدارة</small>}</span>
                <TaskCheck checked disabled={task.approved || busy === `${task.groupId}:${task.taskId}`} label={`إنجاز ${task.title} — ${task.groupName}`} onChange={(checked) => onToggle(task, checked)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// The management's register: each group and its tasks, each with its check.
function Register({ board, onToggle, busy }) {
  const groups = useMemo(() => board.groups.map((group) => ({
    ...group,
    tasks: board.assignments
      .filter((row) => row.groupId === group.id)
      .map((row) => {
        const task = board.tasks.find((item) => item.id === row.taskId);
        const status = board.statuses.find((item) => item.taskId === row.taskId && item.groupId === group.id);
        return task ? { ...task, done: Boolean(status?.done), approved: Boolean(status?.approved) } : null;
      })
      .filter(Boolean).sort((a, b) => Number(a.done) - Number(b.done)),
  })).filter((group) => group.tasks.length > 0), [board]);

  return (
    <section className={styles.panel} aria-label="سجل المهمات">
      <h2>سجل المهمات</h2>
      {groups.length === 0 && <p className={styles.muted}>لم تُربط مهمات بالمجموعات بعد.</p>}
      <div className={styles.groups}>
        {groups.map((group) => (
          <div key={group.id} className={styles.group}>
            <h3 dir="auto">{group.name}</h3>
            <small dir="auto">{group.ownerNames?.join("، ")}</small>
            <ul className={styles.list}>
              {group.tasks.map((task) => {
                const key = `${task.id}:${group.id}`;
                return (
                  <li key={key} className={`${styles.item} ${task.done ? styles.done : ""}`}>
                    <TaskCheck
                      checked={task.done}
                      label={`${task.done ? "إلغاء إنجاز" : "تأكيد إنجاز"} ${task.title} — ${group.name}`}
                      disabled={busy === key}
                      onChange={(checked) => onToggle(task, group, checked)}
                    />
                    <span className={styles.text}>
                      <span dir="auto">{task.title}</span>
                      {task.done && !task.approved && <small>أنجزها المسؤول</small>}
                      {task.approved && <small>أكّدتها الإدارة</small>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// «المهمات الأسبوعية»: what one must do, and for the management the register and the
// way to the page where tasks are written and joined to groups.
export default function WeeklyTasksPage() {
  const navigate = useNavigate();
  const canManage = canStored("tasks.manage");
  const [mine, setMine] = useState(null);
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const own = await getMyTasks();
    if (!own.ok) setError(own.message);
    else { setError(""); setMine(own); }
    if (canManage && showAll) {
      const res = await getTaskBoard();
      if (res.ok) setBoard(res);
      else setError(res.message);
    }
  }, [canManage, showAll]);
  useEffect(() => { load(); }, [load]);

  const toggleMine = async (task, done) => {
    setBusy(`${task.groupId}:${task.taskId}`);
    const res = await setMyTaskDone(task.taskId, task.groupId, done, mine.week);
    setBusy("");
    if (!res.ok) { if (res.code === "WEEK_CLOSED") await load(); return toast.warn(res.message); }
    setMine(res);
    if (canManage) load();
    return undefined;
  };
  const toggleRegister = async (task, group, approved) => {
    const key = `${task.id}:${group.id}`;
    setBusy(key);
    const res = await approveTask(task.id, group.id, approved, board.week || mine.week);
    setBusy("");
    if (!res.ok) { if (res.code === "WEEK_CLOSED") await load(); return toast.warn(res.message); }
    return load();
  };

  return (
    <div className={styles.page} dir="rtl">
      <header className={styles.head}>
        <div>
          <h1>المهمات الأسبوعية</h1>
          {mine?.week && <p className={styles.muted}>الأسبوع الذي بدأ في {weekLabel(mine.week)}</p>}
        </div>
        {canManage && <div className={styles.row}>
          <Button variant="secondary" onClick={() => setShowAll((shown) => !shown)}>{showAll ? "عرض مهماتي" : "عرض مهمات الجمعية"}</Button>
          {showAll && <Button onClick={() => navigate("/weekly-tasks/manage")}>تعديل المهمات والمجموعات</Button>}
        </div>}
      </header>
      {error && <div role="alert" className={styles.error}>{error}</div>}
      {mine && !showAll && <MyTasks tasks={mine.tasks} onToggle={toggleMine} busy={busy} />}
      {canManage && showAll && board && <Register board={board} onToggle={toggleRegister} busy={busy} />}
    </div>
  );
}
