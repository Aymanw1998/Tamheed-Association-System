// Calendar.jsx (New: Attendance Log by Lesson -> Date -> Edit)
import React, { useEffect, useMemo, useState } from "react";
import styles from "./Calendar.module.css";
import AttendancePage from "../Attendance/AttendancePage";

export const Calendar = () => {

  return (
    <div className={styles.calendar} dir="rtl">
      <AttendancePage/>
    </div>
  );
};
