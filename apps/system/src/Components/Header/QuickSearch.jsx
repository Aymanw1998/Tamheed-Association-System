import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../UI/Icon";
import { getAll as getAllStudents } from "../../WebServer/services/student/functionsStudent";
import { getAll as getAllUsers } from "../../WebServer/services/user/functionsUser";
import { getAllLesson } from "../../WebServer/services/lesson/functionsLesson";
import styles from "./QuickSearch.module.css";

// Quick search (package B, 2026-11-08): Ctrl+K (or ⌘K, or "/" outside a
// field) opens one box that finds a page, a student, a staff member or a
// program. Records load only when the box first opens, and only the kinds the
// user may already list (canStudents / canUsers / canLessons from Header).
const TASHKEEL = /[ً-ْٰـ]/g;
export const normalize = (text) => String(text ?? "")
  .replace(TASHKEEL, "")
  .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
  .toLowerCase().trim();

const fullName = (row) => [row.firstname, row.lastname].filter(Boolean).join(" ").trim();
const PER_GROUP = 6;

export function searchAll(query, { pages = [], students = [], users = [], lessons = [] }) {
  const q = normalize(query);
  if (!q) return [{ group: "الصفحات", items: pages.slice(0, 8) }];
  const words = q.split(/\s+/);
  const hit = (...fields) => {
    const text = normalize(fields.join(" "));
    return words.every((word) => text.includes(word));
  };
  const groups = [
    { group: "الصفحات", items: pages.filter((p) => hit(p.label)) },
    { group: "الطلاب", items: students.filter((s) => hit(fullName(s), s.tz)).map((s) => ({ path: `/students/${encodeURIComponent(s.tz)}`, label: fullName(s) || s.tz, hint: s.tz, icon: "student" })) },
    { group: "الطاقم", items: users.filter((u) => hit(fullName(u), u.tz)).map((u) => ({ path: `/users/${encodeURIComponent(u.tz)}`, label: fullName(u) || u.tz, hint: u.tz, icon: "users" })) },
    { group: "البرامج", items: lessons.filter((l) => hit(l.name)).map((l) => ({ path: `/lessons/${encodeURIComponent(l._id)}`, label: l.name, icon: "calendar" })) },
  ];
  return groups.map((g) => ({ ...g, items: g.items.slice(0, PER_GROUP) })).filter((g) => g.items.length);
}

const isTyping = (target) => target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export default function QuickSearch({ pages, canStudents, canUsers, canLessons, onNav }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [data, setData] = useState(null);
  const input = useRef(null);
  const opener = useRef(null);

  const show = useCallback(() => {
    opener.current = document.activeElement;
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
    if (opener.current && typeof opener.current.focus === "function") opener.current.focus();
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "k" || event.key === "K")) { event.preventDefault(); show(); }
      else if (event.key === "/" && !isTyping(event.target) && !event.ctrlKey && !event.metaKey) { event.preventDefault(); show(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [show]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    if (data) return;
    let live = true;
    const none = Promise.resolve(null);
    Promise.all([
      canStudents ? getAllStudents().catch(() => null) : none,
      canUsers ? getAllUsers().catch(() => null) : none,
      canLessons ? getAllLesson().catch(() => null) : none,
    ]).then(([s, u, l]) => {
      if (!live) return;
      setData({ students: s?.ok ? s.students : [], users: u?.ok ? u.users : [], lessons: l?.ok ? l.lessons : [] });
    });
    return () => { live = false; };
  }, [open, data, canStudents, canUsers, canLessons]);

  const groups = useMemo(() => searchAll(query, { pages, ...(data || {}) }), [query, pages, data]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  useEffect(() => { setActive(0); }, [query]);

  const go = (event, item) => {
    close();
    onNav(event, item.path);
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(flat.length - 1, i + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (event.key === "Enter" && flat[active]) {
      event.preventDefault();
      // A plain left click shape, so Header's onNav navigates (with its leave check).
      go({ button: 0, defaultPrevented: false, preventDefault() {}, currentTarget: {}, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }, flat[active]);
    }
  };

  let index = -1;
  return (
    <>
      <button type="button" className={styles.trigger} onClick={(event) => { event.stopPropagation(); show(); }}
        aria-label="بحث سريع" title="بحث سريع (Ctrl+K)" data-tour="quick-search">
        <Icon name="search" size={20} />
      </button>
      {/* On the body, above the sticky header and its menu. */}
      {open && createPortal(
        <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div className={styles.panel} role="dialog" aria-modal="true" aria-label="بحث سريع" dir="rtl" onKeyDown={onKeyDown}>
            <div className={styles.field}>
              <Icon name="search" size={20} />
              <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث عن طالب، موظف، برنامج أو صفحة…" aria-label="نص البحث"
                role="combobox" aria-expanded="true" aria-controls="quick-search-results"
                aria-activedescendant={flat[active] ? `qs-${active}` : undefined} />
              <kbd className={styles.kbd}>Esc</kbd>
            </div>
            <div id="quick-search-results" role="listbox" className={styles.results}>
              {query && !data && (canStudents || canUsers || canLessons) && <p className={styles.note} role="status">جارٍ تحميل السجلات…</p>}
              {groups.map((g) => (
                <div key={g.group} className={styles.group}>
                  <div className={styles.groupTitle}>{g.group}</div>
                  {g.items.map((item) => {
                    index += 1;
                    const mine = index;
                    return (
                      <a key={`${g.group}-${item.path}`} id={`qs-${mine}`} role="option" aria-selected={mine === active}
                        href={item.path} className={`${styles.option} ${mine === active ? styles.optionOn : ""}`}
                        onMouseMove={() => setActive(mine)} onClick={(event) => go(event, item)}>
                        <span className={styles.optionIcon}><Icon name={item.icon || "arrow_left"} size={18} /></span>
                        <span className={styles.optionLabel}>{item.label}</span>
                        {item.hint && <span className={styles.hint} dir="ltr">{item.hint}</span>}
                      </a>
                    );
                  })}
                </div>
              ))}
              {query && data && !flat.length && <p className={styles.note}>لا توجد نتائج لـ«{query}». جرّب جزءًا من الاسم أو رقم الهوية.</p>}
            </div>
            <div className={styles.footer}><span><kbd className={styles.kbd}>↑</kbd><kbd className={styles.kbd}>↓</kbd> للتنقل</span><span><kbd className={styles.kbd}>Enter</kbd> للفتح</span></div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
