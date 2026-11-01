import React, { useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { LinkList } from "../UI/RecordParts";
import { attendanceTotals, inMonth, monthKeys, monthLabel, statusTone } from "../../utils/attendanceView";
import styles from "../UI/RecordParts.module.css";

const pad = (n) => String(n).padStart(2, "0");
const dayOf = (r) => `${pad(r.day)}/${pad(r.month)}/${r.year}`;

// The student page's attendance tab, read-only: a month to look at, that
// month's totals, and each row with its status in colour.
export default function StudentAttendance({ rows }) {
  const { t } = useI18n();
  const [month, setMonth] = useState("all");
  if (!rows.length) return <p className={styles.empty}>{t("record.noAttendance")}</p>;

  const shown = inMonth(rows, month);
  const totals = attendanceTotals(shown);

  return (
    <>
      <div className={styles.attendanceBar}>
        <select
          className={styles.monthSelect}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label={t("record.attendanceMonth")}
          data-testid="attendance-month"
        >
          <option value="all">{t("record.allMonths")}</option>
          {monthKeys(rows).map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
        </select>
        <div className={styles.summary} data-testid="attendance-summary">
          <span className={styles.rate}>{totals.rate === null ? "—" : `${totals.rate}%`}</span>
          <span className={styles.chip} data-chip="present">حاضر {totals.present}</span>
          <span className={styles.chip} data-chip="late">متأخر {totals.late}</span>
          <span className={styles.chip} data-chip="absent">غائب {totals.absent}</span>
        </div>
      </div>
      <LinkList
        empty={t("record.noAttendance")}
        items={shown.map((r) => ({
          key: `${r.lesson}-${r.dateKey}`,
          to: r.lessonName ? `/lessons/${r.lesson}` : null,
          name: `${dayOf(r)} · ${r.lessonName || t("record.deletedLesson")}`,
          meta: r.notes || "",
          badge: r.status ? { text: r.status, tone: statusTone(r.status) } : null,
        }))}
      />
    </>
  );
}
