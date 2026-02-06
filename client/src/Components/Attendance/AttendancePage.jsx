import React, { useEffect, useMemo, useState } from "react";
import styles from "./AttendancePage.module.css";
import { getLessonsToday, getAllLesson as getAllLessons } from "../../WebServer/services/lesson/functionsLesson";
import { getAttendanceSheet, saveAttendanceSheet, getLessonDates } from "../../WebServer/services/attendance/functionsAttendance";
import { toast } from "../../ALERT/SystemToasts";


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
            style={value === s ? { backgroundColor: s === "حاضر" ? "green" : s === "غائب" ? "red" : "orange" } : {} }
            onClick={() => onChange(s)}
            >
            {s}
            </button>
        ))}
        </div>
    );
};

export default function AttendancePage() {
    const [tab, setTab] = useState("today"); // today | history
    useEffect(() => {setSearchDate("");setSearchLesson("")}, [tab]);
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
    console.log("historyDates", historyDates);
    console.log("selectedHistoryDate", selectedHistoryDate);

    // sheet
    const [sheet, setSheet] = useState(null);
    const [dirty, setDirty] = useState(false);

    //searchText
    const [searchDate, setSearchDate] = useState("");
    const [searchLesson, setSearchLesson] = useState("");
    const doChange = (setValue, value) => {
        let b = true;
        if(dirty){
            if(window.confirm("هناك تغييرات غير محفوظة. هل أنت متأكد أنك تريد المتابعة دون حفظ؟")) {
                b = true;
            } else b = false;
        }
        if(b) setValue(value);
    }
    // load left side
    useEffect(() => {
        const load = async () => {
        setLoadingLeft(true);
        try {
            if (tab === "today") {
            const r = await getLessonsToday();
            if (!r?.ok) throw new Error(r?.message || "failed");
            console.log("lessons", r.lessons, localStorage.getItem("user_id"))
            setTodayLessons(r.lessons.filter(l => localStorage.getItem("roles").includes("ادارة") || l.teacher?._id == localStorage.getItem("user_id")));
            } else {
            const r = await getAllLessons();
            if (!r?.ok) throw new Error(r?.message || "failed");
            console.log("lessons", r.lessons, localStorage.getItem("user_id"))
            setAllLessons(r.lessons.filter(l => localStorage.getItem("roles").includes("ادارة") || l.teacher == localStorage.getItem("user_id")));
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
    }, [tab]);

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

    const headerDateText = useMemo(() => {
        
        if (tab === "today") return ymd(date);
        return selectedHistoryDate ? selectedHistoryDate.ymd : "اختر تاريخ";
    }, [tab, date, selectedHistoryDate]);

    return (
        <div className={styles.page} dir="rtl">
        <div className={styles.topbar}>
            <h2 className={styles.title}>حضور وغياب</h2>
            <div className={styles.tabs}>
            <button className={`${styles.tabBtn} ${tab === "today" ? styles.tabActive : ""}`} 
            style={tab === "today" ? {backgroundColor: "green"} : {}}
            onClick={() => doChange(setTab,"today")}>
                درس اليوم
            </button>
            <button className={`${styles.tabBtn} ${tab === "history" ? styles.tabActive : ""}`} 
            style={tab === "history" ? {backgroundColor: "green"} : {}}
            onClick={() => doChange(setTab,"history")}>
                سجل الحضور السابق
            </button>
            </div>
            <br/>

            <div className={styles.actions}>
            <button className={styles.saveBtn} style={tab === "today" ?{backgroundColor: "green", color: "black"}: {backgroundColor: "yellow", color: "black"}} onClick={onSave} disabled={!sheet || loadingSheet || !dirty}>
                حفظ
            </button>
            <span className={styles.miniInfo}>
                {dirty ? "يوجد بيانات لم تُحفظ" : ""}
            </span>
            </div>
        </div>

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
                    // אם כבר פתוח שיעור - נטעין מחדש
                    if (selectedLesson) openLessonToday(selectedLesson);
                }}
                />
            </div><br/> */}
            </>
            )}
            {/* LEFT */}
            <div className={styles.left}>
            <div className={styles.leftHeader}>
                <div className={styles.leftTitle}>
                {tab === "today" ? "دروس اليوم - " + `${ymd(date)}` : "كل الدروس"}
                </div>
                {loadingLeft && <div className={styles.small}>جلب البيانات...</div>}
            </div>

            <div className={styles.lessonList}>
                <div className={styles.filterGroup}>
                    <label>بحث: </label>
                    <input value={searchLesson} onChange={(e)=>setSearchLesson(e.target.value)} placeholder="اسم الدرس" />
                </div>
                {leftLessons.filter(l => l.name.includes(searchLesson)).map((l) => (
                <button
                    key={l._id}
                    className={`${styles.lessonCard} ${selectedLesson?._id === l._id ? styles.lessonActive : ""}`}
                    onClick={() => (tab === "today" ? doChange(openLessonToday,l) : doChange(openLessonHistory,l))}
                >
                    <div className={styles.lessonName}>{l.name}</div>
                    <div className={styles.lessonMeta}>
                    <span>{toHHMM(l.date?.startMin)} - {toHHMM(l.date?.endMin)}</span>
                    <span>• غرفة {l.room}</span>
                    </div>
                </button>
                ))}
                {!loadingLeft && leftLessons.length === 0 && (
                <div className={styles.empty}>لا يوجد دروس في هذا اليوم</div>
                )}
            </div>

            {/* HISTORY: dates list */}
            {tab === "history" && selectedLesson && (
                <div className={styles.datesPanel}>
                <b className={styles.leftTitle}>تواريخ: </b>
                <div className={styles.filterGroup}>
                    <label>بحث: </label>
                    <input value={searchDate} onChange={(e)=>setSearchDate(e.target.value)} placeholder="dd/mm/yyyy" />
                </div>
                {loadingSheet && historyDates.length === 0 ? (
                    <div className={styles.small}>جلب البيانات...</div>
                ) : (
                    <div className={styles.datesList}>
                    {historyDates.filter(d => d.ymd.includes(searchDate)).map((d) => (
                        <>
                        {console.log("render history date", d.dateKey, selectedHistoryDate?.dateKey)}
                        <button
                        key={d.dateKey}
                        className={`${styles.tabBtn} ${String(selectedHistoryDate?.dateKey || "" ) == String(d.dateKey) ? styles.tabActive : ""}`}
                        onClick={() => doChange(openHistoryDate,d)}
                        >
                        {d.ymd}
                        </button>
                        </>
                    ))}
                    {historyDates.length === 0 && <div className={styles.empty}>لا يوجد تواريخ مستقبلية</div>}
                    </div>
                )}
                </div>
            )}
            </div>

            {/* RIGHT */}
            <div className={styles.right}>
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
                        {headerDateText} • غرفة {sheet.room} • {sheet.teacherName || ""}
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


                <div className={styles.footer}>
                    <div className={styles.counts}>
                    حاضر: {sheet.items.filter(x => x.status === "حاضر").length} •{" "}
                    متأخر: {sheet.items.filter(x => x.status === "متأخر").length} •{" "}
                    غائب: {sheet.items.filter(x => x.status === "غائب").length} •{" "}
                    </div>
                </div>
                </div>
            )}
            </div>
        </div>
        </div>
    );
}
