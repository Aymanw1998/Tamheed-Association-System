import { canStored } from "../../utils/session";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyTasks } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
import Button from "../UI/Button.jsx";
import styles from "./WeeklyTasks.module.css";

const SHOWN = 5;

// First on the dashboard (owner, 2026-11-16): «مهماتي هذا الأسبوع», the tasks
// still open this week by name, for someone who has any left.
export default function WeeklyTasksCard() {
  const navigate = useNavigate();
  const [open, setOpen] = useState([]);

  useEffect(() => {
    let alive = true;
    if (!canStored("tasks.view")) return undefined;
    getMyTasks().then((res) => {
      if (alive && res.ok) setOpen((res.tasks || []).filter((task) => !task.done));
    });
    return () => { alive = false; };
  }, []);

  if (!open.length) return null;
  const more = open.length - SHOWN;
  return (
    <section className={styles.card} data-tour="dashboard-weekly-tasks" aria-label="مهماتي هذا الأسبوع">
      <div className={styles.cardBody}>
        <strong>مهماتي هذا الأسبوع ({open.length})</strong>
        <ul className={styles.cardList}>
          {open.slice(0, SHOWN).map((task) => (
            <li key={`${task.groupId}:${task.taskId}`}>
              <span dir="auto">{task.title}</span>
              {task.groupName ? <small dir="auto"> · {task.groupName}</small> : null}
            </li>
          ))}
        </ul>
        {more > 0 ? <small>و{more} أخرى</small> : null}
      </div>
      <Button size="sm" onClick={() => navigate("/weekly-tasks")}>عرض المهمات</Button>
    </section>
  );
}
