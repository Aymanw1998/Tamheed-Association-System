import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyTasks } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
import Button from "../UI/Button.jsx";
import styles from "./WeeklyTasks.module.css";

// On the dashboard: only for someone with tasks left this week.
export default function WeeklyTasksCard() {
  const navigate = useNavigate();
  const [left, setLeft] = useState(0);

  useEffect(() => {
    let alive = true;
    getMyTasks().then((res) => {
      if (alive && res.ok) setLeft((res.tasks || []).filter((task) => !task.done).length);
    });
    return () => { alive = false; };
  }, []);

  if (!left) return null;
  return (
    <div className={styles.card} data-tour="dashboard-weekly-tasks">
      <span>
        <strong>لدى مجموعتك مهمات أسبوعية</strong>
        متبقٍ هذا الأسبوع: {left}
      </span>
      <Button size="sm" onClick={() => navigate("/weekly-tasks")}>عرض المهمات</Button>
    </div>
  );
}
