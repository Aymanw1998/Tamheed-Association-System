import React, { useEffect, useMemo, useState } from "react";
import styles from "./AttendancePage.module.css";
import { useLocation } from "react-router-dom";
import { getLessonsToday, getAllLesson as getAllLessons } from "../../WebServer/services/lesson/functionsLesson";
import { getAttendanceSheet, saveAttendanceSheet, getLessonDates } from "../../WebServer/services/attendance/functionsAttendance";
import { toast } from "../../ALERT/SystemToasts";
import { getStoredUserId, isStoredAdmin } from "../../utils/session";
import { roomLabel } from "../../utils/rooms";
import { attendanceDateLabel } from "../../utils/attendanceDates";
import { ask } from "../Provides/confirmBus";


const pad2 = (n) => String(n).padStart(2, "0");
const todayObj = () => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
};
const ymd = (date) => `${pad2(date.day)}/${pad2(date.month)}/${date.year}`;

const toHHMM = (min) => {
    const m = Math.max(0, Math.min(Number(min ?? 0), 1439));
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${pad2(h)}:${pad2(mm)}`;
};

const StatusPill = ({ value, onChange }) => {
    const opts = ["حاضر", "غائب", "متأخر"];
    return (
        <div className={styles.pills}>
        {opts.map((s) => (
            <button
            key={s}
            type="button"
            className={`${styles.pill} ${value === s ? styles.pillActive : ""}`}
            style={value === s ? { backgroundColor: s === "حاضر" ? "var(--color-success-500)" : s === "غائب" ? "var(--color-danger-500)" : "var(--color-warning-500)" } : {} }
            onClick={() => onChange(s)}
            >
            {s}
            </button>
        ))}
        </div>
    );
};

export default function AttendancePage() {
    const location = useLocation();
    const isAdmin = isStoredAdmin();
    const userId = getStoredUserId();
    const [tab, setTab] = useState("today"); // today | history
    useEffect(() => {setSearchLesson("")}, [tab]);
    // left lists
    const [todayLessons, setTodayLessons] = useState([]);
    const [allLessons, setAllLessons] = useState([]);

    const [loadingLeft, setLoadingLeft] = useState(false);
    const [loadingSheet, setLoadingSheet] = useState(false);

    // selection
    const [selectedLesson, setSelectedLesson] = useState(null);

    // date selection
    const [date, setDate] = useState(todayObj(new Date())); // used in today tab
    const [historyDates, setHistoryDates] = useState([]); // dates for selected lesson
    const [selectedHistoryDate, setSelectedHistoryDate] = useState(null);

    // sheet
    const [sheet, setSheet] = useState(null);
    const [dirty, setDirty] = useState(false);

    //searchText
    const [searchLesson, setSearchLesson] = useState("");
    const preselectedLessonId = location.state?.lessonId || "";
    // Returns whether the change went ahead (false if the user kept unsaved edits).
    const doChange = async (setValue, value) => {
        if (dirty) {
            const ok = await ask("navigate").catch(() => false);
            if (!ok) return false;
        }
        setValue(value);
        return true;
    }

    // Phones show one step at a time: the lesson list, then the attendance
    // sheet. In history, picking a lesson first opens a date chooser.
    const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 900px)").matches);
    useEffect(() => {
        const query = window.matchMedia("(max-width: 900px)");
        const onChange = (e) => setIsMobile(e.matches);
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);
    const [mobileView, setMobileView] = useState("lessons"); // lessons | sheet
    const [dateModalOpen, setDateModalOpen] = useState(false);
    useEffect(() => {
        if (!dateModalOpen) return undefined;
        const onKey = (e) => { if (e.key === "Escape") setDateModalOpen(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [dateModalOpen]);
    // load left side
    useEffect(() => {
        const load = async () => {
        setLoadingLeft(true);
        try {
            if (tab === "today") {
            const r = await getLessonsToday();
            if (!r?.ok) throw new Error(r?.message || "failed");
            setTodayLessons(r.lessons.filter(l => isAdmin || String(l.teacher) === String(userId)));
            } else {
            const r = await getAllLessons();
            if (!r?.ok) throw new Error(r?.message || "failed");
            setAllLessons(r.lessons.filter(l => isAdmin || String(l.teacher) === String(userId)));
            }
        } catch (e) {
            toast?.error ? toast.error(e.message) : console.error(e);
        } finally {
            setLoadingLeft(false);
        }
        };
        load();
        // reset selections when switching tab
        setSelectedLesson(null);
        setSheet(null);
        setDirty(false);
        setHistoryDates([]);
        setSelectedHistoryDate(null);
        setMobileView("lessons");
        setDateModalOpen(false);
    }, [tab]);

    useEffect(() => {
        if (tab !== "today" || !preselectedLessonId || loadingLeft) return;
        const lesson = todayLessons.find((item) => String(item?._id || "") === String(preselectedLessonId));
        if (!lesson) return;
        openLessonToday(lesson);
        setMobileView("sheet");
    }, [tab, preselectedLessonId, todayLessons, loadingLeft]);

    const openLessonToday = async (lesson) => {
        setSelectedLesson(lesson);
        setSelectedHistoryDate(null);
        setSheet(null);
        setDirty(false);

        setLoadingSheet(true);
        try {
        const r = await getAttendanceSheet(lesson._id, date);
        if (!r.ok) throw new Error(r.message);
        setSheet(r.sheet);
        } catch (e) {
        toast?.error ? toast.error(e.message) : console.error(e);
        } finally {
        setLoadingSheet(false);
        }
    };

    const openLessonHistory = async (lesson) => {
        setSelectedLesson(lesson);
        setSheet(null);
        setDirty(false);
        setHistoryDates([]);
        setSelectedHistoryDate(null);

        setLoadingSheet(true);
        try {
        const r = await getLessonDates(lesson._id);
        if (!r.ok) throw new Error(r.message);
        setHistoryDates(r.dates);
        } catch (e) {
        toast?.error ? toast.error(e.message) : console.error(e);
        } finally {
        setLoadingSheet(false);
        }
    };

    const openHistoryDate = async (dObj) => {
        if (!selectedLesson) return;
        setSelectedHistoryDate(dObj);
        setSheet(null);
        setDirty(false);

        setLoadingSheet(true);
        try {
        const r = await getAttendanceSheet(selectedLesson._id, dObj);
        if (!r.ok) throw new Error(r.message);
        setSheet(r.sheet);
        } catch (e) {
        toast?.error ? toast.error(e.message) : console.error(e);
        } finally {
        setLoadingSheet(false);
        }
    };

    const updateItem = (studentId, patch) => {
        setSheet((prev) => {
        if (!prev) return prev;
        const items = prev.items.map((it) =>
            it.studentId === studentId ? { ...it, ...patch } : it
        );
        return { ...prev, items };
        });
        setDirty(true);
    };

    const markAll = (status) => {
        setSheet((prev) => {
        if (!prev) return prev;
        return { ...prev, items: prev.items.map(it => ({ ...it, status })) };
        });
        setDirty(true);
    };

    const onSave = async () => {
        if (!selectedLesson || !sheet) return;
        const usedDate = tab === "today" ? date : selectedHistoryDate;
        if (!usedDate) return;

        setLoadingSheet(true);
        try {
        const items = sheet.items.map(it => ({
            studentId: it.studentId,
            status: it.status,
            notes: it.notes || "",
        }));

        const r = await saveAttendanceSheet(selectedLesson._id, usedDate, items);
        if (!r.ok) throw new Error(r.message);

        setDirty(false);
        toast?.success ? toast.success("حُفظ بنحاح ✅") : console.log("saved");
        } catch (e) {
        toast?.error ? toast.error(e.message) : console.error(e);
        } finally {
        setLoadingSheet(false);
        }
    };

    const leftLessons = tab === "today" ? todayLessons : allLessons;

    const pickLesson = async (lesson) => {
        if (tab === "today") {
            if (await doChange(openLessonToday, lesson)) setMobileView("sheet");
            return;
        }
        if (await doChange(openLessonHistory, lesson) && isMobile) setDateModalOpen(true);
    };

    const pickDate = async (dateObj) => {
        if (!(await doChange(openHistoryDate, dateObj))) return;
        setDateModalOpen(false);
        setMobileView("sheet");
    };

    const backToLessons = async () => {
        if (dirty) {
            const ok = await ask("navigate").catch(() => false);
            if (!ok) return;
            setDirty(false);
        }
        setMobileView("lessons");
    };

    const headerDateText = useMemo(() => {
        
        if (tab === "today") return ymd(date);
        return selectedHistoryDate ? selectedHistoryDate.ymd : "اختر تاريخ";
    }, [tab, date, selectedHistoryDate]);

    return (
        <div className={styles.page} dir="rtl">
        {!(isMobile && mobileView === "sheet") && <div className={styles.topbar}>
            <h2 className={styles.title}>حضور وغياب</h2>
            <div className={styles.tabs}>
            <button className={`${styles.tabBtn} ${tab === "today" ? styles.tabActive : ""}`}
            onClick={() => doChange(setTab,"today")}>
                درس اليوم
            </button>
            <button className={`${styles.tabBtn} ${tab === "history" ? styles.tabActive : ""}`}
            onClick={() => doChange(setTab,"history")}>
                سجل الحضور السابق
            </button>
            </div>
        </div>}

        <div className={styles.body}>
            {tab === "today" && (<>
            {/* <div className={styles.dateBox}>
                <label className={styles.label}>تاريخ:</label>
                <input
                className={styles.input}
                type="date"
                value={ymd(date)}
                onChange={(e) => {
                    const [yy, mm, dd] = e.target.value.split("-").map(Number);
                    const next = { year: yy, month: mm, day: dd };
                    setDate(next);
                    // ملاحظة عربية
                    if (selectedLesson) openLessonToday(selectedLesson);
                }}
                />
            </div><br/> */}
            </>
            )}
            {/* LEFT */}
            {!(isMobile && mobileView === "sheet") && <div className={styles.left}>
            <div className={styles.leftHeader}>
                <div className={styles.leftTitle}>
                {tab === "today" ? "دروس اليوم - " + `${ymd(date)}` : "كل الدروس"}
                </div>
                {loadingLeft && <div className={styles.small}>جلب البيانات...</div>}
            </div>

            <div className={styles.lessonList}>
                <div className={styles.filterGroup}>
                    <label htmlFor="attendance-lesson-search">بحث: </label>
                    <input id="attendance-lesson-search" value={searchLesson} onChange={(e)=>setSearchLesson(e.target.value)} placeholder="اسم الدرس" />
                </div>
                {/* Scrolls after three lessons so the sheet stays in view. */}
                <div className={styles.lessonScroll}>
                {leftLessons.filter(l => l.name.includes(searchLesson)).map((l) => (
                <button
                    key={l._id}
                    className={`${styles.lessonCard} ${selectedLesson?._id === l._id ? styles.lessonActive : ""}`}
                    onClick={() => pickLesson(l)}
                >
                    <div className={styles.lessonName}>{l.name}</div>
                    <div className={styles.lessonMeta}>
                    <span>{toHHMM(l.date?.startMin)} - {toHHMM(l.date?.endMin)}</span>
                    <span>• {roomLabel(l.room)}</span>
                    </div>
                </button>
                ))}
                {!loadingLeft && leftLessons.length === 0 && (
                <div className={styles.empty}>{tab === "today" ? "لا يوجد دروس في هذا اليوم" : "لا يوجد دروس"}</div>
                )}
                </div>
            </div>

            {/* HISTORY: pick one of the dates that already have attendance (phones use the date window) */}
            {tab === "history" && selectedLesson && !isMobile && (
                <div className={styles.datesPanel}>
                <label className={styles.leftTitle} htmlFor="attendance-date">التاريخ:</label>
                {loadingSheet && historyDates.length === 0 ? (
                    <div className={styles.small}>جلب البيانات...</div>
                ) : historyDates.length === 0 ? (
                    <div className={styles.empty}>لا يوجد حضور مسجّل لهذا الدرس بعد</div>
                ) : (
                    <select
                    id="attendance-date"
                    className={styles.dateSelect}
                    value={selectedHistoryDate ? String(selectedHistoryDate.dateKey) : ""}
                    onChange={(e) => {
                        const picked = historyDates.find((d) => String(d.dateKey) === e.target.value);
                        if (picked) pickDate(picked);
                    }}
                    >
                    <option value="" disabled>اختر تاريخ ({historyDates.length})</option>
                    {historyDates.map((d) => (
                        <option key={d.dateKey} value={String(d.dateKey)}>
                        {attendanceDateLabel(d)}
                        </option>
                    ))}
                    </select>
                )}
                </div>
            )}
            </div>}

            {/* RIGHT */}
            {!(isMobile && mobileView === "lessons") && <div className={styles.right}>
            {isMobile && (
                <div className={styles.mobileBar}>
                <button type="button" className={styles.backBtn} onClick={backToLessons}>
                    → الدروس
                </button>
                {tab === "history" && selectedLesson && (
                    <button type="button" className={styles.changeDateBtn} onClick={() => setDateModalOpen(true)}>
                    تغيير التاريخ
                    </button>
                )}
                </div>
            )}
            {!selectedLesson && (
                <div className={styles.placeholder}>
                {tab === "today" ? "اختيار درس اولا " : "اختيار درس وتاريخ اولا"}
                </div>
            )}

            {selectedLesson && tab === "history" && !selectedHistoryDate && (
                <div className={styles.placeholder}>
                اختيار تاريخ للدرس: <b>{selectedLesson.name}</b>
                </div>
            )}

            {loadingSheet && (
                <div className={styles.placeholder}>جلب البيانات...</div>
            )}

            {sheet && (
                <div className={styles.sheet}>
                <div className={styles.sheetHeader}>
                    <div>
                    <div className={styles.sheetTitle}>{sheet.lessonName}</div>
                    <div className={styles.sheetSub}>
                        {headerDateText} • {roomLabel(sheet.room)} • {sheet.teacherName || ""}
                    </div>
                    </div>

                    <div className={styles.quickBtns}>
                    <button className={styles.quickBtn} onClick={() => markAll("حاضر")} disabled={loadingSheet}>الكل حاضر</button>
                    <button className={styles.quickBtn} onClick={() => markAll("متأخر")} disabled={loadingSheet}>الكل متأخر</button>    
                    <button className={styles.quickBtn} onClick={() => markAll("غائب")} disabled={loadingSheet}>الكل غائب</button>
                    </div>
                </div>

                {/* Desktop table */}
                <div className={styles.tableWrap + " " + styles.desktopOnly}>
                <table className={styles.table}>
                    <thead>
                    <tr>
                        <th>طالب</th>
                        <th>حالة</th>
                        <th>ملاحظة</th>
                    </tr>
                    </thead>
                    <tbody>
                    {sheet.items.map((it) => (
                        <tr key={it.studentId}>
                        <td className={styles.studentCell}>
                            <div className={styles.studentName}>{it.studentName}</div>
                            {it.tz && <div className={styles.studentTz}>{it.tz}</div>}
                        </td>
                        <td>
                            <StatusPill
                            value={it.status}
                            onChange={(s) => updateItem(it.studentId, { status: s })}
                            />
                        </td>
                        <td>
                            <input
                            className={styles.noteInput}
                            value={it.notes || ""}
                            onChange={(e) =>
                                updateItem(it.studentId, { notes: e.target.value })
                            }
                            />
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>

                {/* Mobile vertical table */}
                <div className={styles.mobileOnly}>
                {sheet.items.map((it, idx) => (
                    <div key={it.studentId} className={styles.mobileRow}>
                    <div className={styles.mobileHeader}>
                        <span className={styles.mobileIndex}>{idx + 1}</span>
                        <div>
                        <div className={styles.studentName}>{it.studentName}</div>
                        {it.tz && <div className={styles.studentTz}>{it.tz}</div>}
                        </div>
                    </div>

                    <div className={styles.mobileSection}>
                        <label>الحالة</label>
                        <StatusPill
                        value={it.status}
                        onChange={(s) => updateItem(it.studentId, { status: s })}
                        />
                    </div>

                    <div className={styles.mobileSection}>
                        <label>ملاحظة</label>
                        <input
                        className={styles.noteInput}
                        placeholder="أدخل ملاحظة"
                        value={it.notes || ""}
                        onChange={(e) =>
                            updateItem(it.studentId, { notes: e.target.value })
                        }
                        />
                    </div>
                    </div>
                ))}
                </div>


                {/* Save sits with the sheet it saves and stays visible while scrolling. */}
                <div className={styles.footer}>
                    <div className={styles.counts}>
                    حاضر: {sheet.items.filter(x => x.status === "حاضر").length} •{" "}
                    متأخر: {sheet.items.filter(x => x.status === "متأخر").length} •{" "}
                    غائب: {sheet.items.filter(x => x.status === "غائب").length}
                    </div>
                    <div className={styles.actions}>
                    {dirty && <span className={styles.miniInfo}>يوجد بيانات لم تُحفظ</span>}
                    <button className={styles.saveBtn} onClick={onSave} disabled={loadingSheet || !dirty}>
                        حفظ
                    </button>
                    </div>
                </div>
                </div>
            )}
            </div>}
        </div>

        {/* Phones: choose the date after tapping a lesson in history. */}
        {dateModalOpen && selectedLesson && (
            <div className={styles.dateModalOverlay} onClick={() => setDateModalOpen(false)}>
            <div
                className={styles.dateModal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="attendance-date-title"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 id="attendance-date-title" className={styles.dateModalTitle}>اختر تاريخ</h3>
                <div className={styles.small}>{selectedLesson.name}</div>
                {loadingSheet && historyDates.length === 0 ? (
                <div className={styles.small}>جلب البيانات...</div>
                ) : historyDates.length === 0 ? (
                <div className={styles.empty}>لا يوجد حضور مسجّل لهذا الدرس بعد</div>
                ) : (
                <div className={styles.dateOptions}>
                    {historyDates.map((d) => (
                    <button
                        key={d.dateKey}
                        type="button"
                        className={`${styles.dateOption} ${String(selectedHistoryDate?.dateKey || "") === String(d.dateKey) ? styles.dateOptionActive : ""}`}
                        onClick={() => pickDate(d)}
                    >
                        {attendanceDateLabel(d)}
                    </button>
                    ))}
                </div>
                )}
                <button type="button" className={styles.dateModalClose} onClick={() => setDateModalOpen(false)}>
                إلغاء
                </button>
            </div>
            </div>
        )}
        </div>
    );
}
