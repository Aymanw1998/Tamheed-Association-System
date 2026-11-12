import React, { useEffect, useRef, useState } from "react";
import styles from "./DisplayScreensPage.module.css";
import { useConfirm } from "../Provides/ConfirmContext";
import { toast } from "../../ALERT/SystemToasts.jsx";
import {
  createDisplay, deleteDisplay, displayLink, listDisplays, rotateDisplayLink, updateDisplay,
} from "../../WebServer/services/display/functionsDisplay.jsx";
import LayoutCards, { LayoutThumb, layoutLabel } from "./LayoutCards";

// Wall display screens (owner, 2026-11-12): each screen has a name, a layout
// and a secret link. The link is shown once, when the screen is created or a
// new link is issued; the server keeps only its fingerprint. The layout is
// always picked from picture cards; nothing is picked in advance.
const MAX_NAME = 60;

const formatDate = (iso) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(t)); } catch { return ""; }
};

function LinkDialog({ link, screenName, onClose }) {
  const field = useRef(null);
  const copy = () => {
    try {
      Promise.resolve(navigator.clipboard.writeText(link))
        .then(() => toast.success("تم نسخ الرابط"))
        .catch(() => { if (field.current) field.current.select(); toast.error("تعذّر النسخ، انسخوا الرابط يدويًا."); });
    } catch {
      if (field.current) field.current.select();
      toast.error("تعذّر النسخ، انسخوا الرابط يدويًا.");
    }
  };
  return (
    <div className="c-overlay">
      <div className="c-dialog" role="dialog" aria-modal="true" aria-labelledby="display-link-title" dir="rtl">
        <div className="c-header"><h3 id="display-link-title">رابط الشاشة «{screenName}»</h3></div>
        <div className={`c-body ${styles.dialogBody}`}>
          <p className={styles.warn}>احفظ الرابط الآن — لن يظهر مرة أخرى.</p>
          <p className={styles.note}>افتحوا هذا الرابط في تطبيق العرض على الشاشة. من يملك الرابط يرى برنامج الأسبوع فقط.</p>
          <input ref={field} className={styles.linkField} dir="ltr" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="رابط الشاشة" />
        </div>
        <div className="c-actions">
          <button type="button" className="c-btn" onClick={onClose}>إغلاق</button>
          <button type="button" className="c-btn c-btn-primary" onClick={copy}>نسخ الرابط</button>
        </div>
      </div>
    </div>
  );
}

function ScreenRow({ screen, busy, onLayout, onRename, onRotate, onDelete }) {
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState(screen.name);
  const pick = async (value) => {
    if (value === screen.layout || await onLayout(value)) setPicking(false);
  };
  const submit = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || clean === screen.name) { setRenaming(false); setName(screen.name); return; }
    if (await onRename(clean)) setRenaming(false);
  };
  return (
    <li className={styles.row} data-screen={screen.id}>
      <div className={styles.rowMain}>
        {renaming ? (
          <form className={styles.renameForm} data-rename onSubmit={submit}>
            <input className={styles.input} value={name} maxLength={MAX_NAME} autoFocus aria-label="اسم الشاشة" onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="c-btn c-btn-primary" disabled={busy}>حفظ</button>
            <button type="button" className="c-btn" onClick={() => { setRenaming(false); setName(screen.name); }}>إلغاء</button>
          </form>
        ) : (
          <div className={styles.nameLine}>
            <strong className={styles.name}>{screen.name}</strong>
            {screen.createdAt ? <span className={styles.date}>{`أُضيفت ${formatDate(screen.createdAt)}`}</span> : null}
          </div>
        )}
        <div className={styles.layoutLine}>
          <span className={styles.miniThumb}><LayoutThumb value={screen.layout} /></span>
          <span>طريقة العرض: <b>{layoutLabel(screen.layout)}</b></span>
          <button type="button" className="c-btn" disabled={busy} aria-expanded={picking ? "true" : "false"} onClick={() => setPicking((v) => !v)}>
            {picking ? "إلغاء" : "تغيير طريقة العرض"}
          </button>
        </div>
      </div>
      <div className={styles.actions}>
        {!renaming ? <button type="button" className="c-btn" disabled={busy} onClick={() => setRenaming(true)}>إعادة تسمية</button> : null}
        <button type="button" className="c-btn" disabled={busy} onClick={onRotate}>رابط جديد</button>
        <button type="button" className="c-btn c-btn-danger" disabled={busy} onClick={onDelete}>حذف</button>
      </div>
      {picking ? (
        <div className={styles.rowCards}>
          <LayoutCards value={screen.layout} disabled={busy} label={`طريقة العرض للشاشة ${screen.name}`} onPick={pick} />
        </div>
      ) : null}
    </li>
  );
}

export default function DisplayScreensPage() {
  const confirm = useConfirm();
  const [screens, setScreens] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [name, setName] = useState("");
  const [layout, setLayout] = useState("");
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState(null); // { link, name }: only in memory, only until closed

  useEffect(() => {
    let live = true;
    listDisplays().then((res) => {
      if (!live) return;
      if (res && res.ok) setScreens(res.screens || []);
      else { setScreens([]); setError((res && res.message) || "تعذّر تحميل الشاشات"); }
    });
    return () => { live = false; };
  }, []);

  const replace = (next) => setScreens((list) => (list || []).map((s) => (s.id === next.id ? next : s)));

  const add = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || !layout) return;
    setCreating(true);
    const res = await createDisplay({ name: clean, layout });
    setCreating(false);
    if (!res || !res.ok) { toast.error((res && res.message) || "تعذّر إضافة الشاشة"); return; }
    setScreens((list) => [...(list || []), res.screen]);
    setName("");
    setLayout("");
    setShown({ link: displayLink(res.token), name: res.screen.name });
  };

  const work = async (screen, run) => {
    setBusyId(screen.id);
    try { return await run(); } finally { setBusyId(""); }
  };

  const changeLayout = (screen) => (value) => work(screen, async () => {
    const res = await updateDisplay(screen.id, { layout: value });
    if (res && res.ok) { replace(res.screen); toast.success("تم الحفظ. تتغيّر الشاشة خلال دقيقة."); return true; }
    toast.error((res && res.message) || "تعذّر حفظ الشاشة");
    return false;
  });

  const rename = (screen) => (value) => work(screen, async () => {
    const res = await updateDisplay(screen.id, { name: value });
    if (res && res.ok) { replace(res.screen); return true; }
    toast.error((res && res.message) || "تعذّر حفظ الشاشة");
    return false;
  });

  const rotate = (screen) => async () => {
    const yes = await confirm({
      title: "رابط جديد",
      message: `سيتوقف الرابط القديم للشاشة «${screen.name}» عن العمل فورًا، وستعرض الشاشة رسالة حتى تفتحوا الرابط الجديد عليها.`,
      confirmText: "إنشاء رابط جديد",
      danger: true,
    });
    if (!yes) return;
    await work(screen, async () => {
      const res = await rotateDisplayLink(screen.id);
      if (res && res.ok) setShown({ link: displayLink(res.token), name: screen.name });
      else toast.error((res && res.message) || "تعذّر إنشاء رابط جديد");
    });
  };

  const remove = (screen) => async () => {
    const yes = await confirm({
      title: "حذف الشاشة",
      message: `ستُحذف الشاشة «${screen.name}» ويتوقف رابطها عن العمل فورًا.`,
      confirmText: "حذف",
      danger: true,
    });
    if (!yes) return;
    await work(screen, async () => {
      const res = await deleteDisplay(screen.id);
      if (res && res.ok) setScreens((list) => (list || []).filter((s) => s.id !== screen.id));
      else toast.error((res && res.message) || "تعذّر حذف الشاشة");
    });
  };

  return (
    <div className={styles.page} dir="rtl">
      <header className={styles.head}>
        <h2 className={styles.title}>شاشات العرض</h2>
        <p className={styles.note}>شاشة على الحائط تعرض برنامج الأسبوع بلا تسجيل دخول. لكل شاشة رابط خاص وطريقة عرض تختارونها من هنا.</p>
      </header>

      <form className={styles.newForm} data-new-screen onSubmit={add}>
        <label className={styles.field}>
          <span>اسم الشاشة</span>
          <input className={styles.input} value={name} maxLength={MAX_NAME} placeholder="مثلًا: المدخل الرئيسي" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className={styles.pickField}>
          <span>طريقة العرض</span>
          <LayoutCards value={layout} disabled={creating} label="طريقة العرض للشاشة الجديدة" onPick={setLayout} />
        </div>
        <div className={styles.submitLine}>
          <button type="submit" className="c-btn c-btn-primary" disabled={creating || !name.trim() || !layout}>{creating ? "جارٍ الإضافة…" : "إضافة شاشة"}</button>
          {!layout ? <span className={styles.hint}>اختر شكل العرض أولاً.</span> : null}
        </div>
      </form>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {screens === null ? <p className={styles.note}>جارٍ التحميل…</p> : null}
      {screens && !screens.length && !error ? <p className={styles.note}>لا توجد شاشات بعد. أضيفوا شاشة لتحصلوا على رابطها.</p> : null}
      {screens && screens.length ? (
        <ul className={styles.list}>
          {screens.map((screen) => (
            <ScreenRow key={screen.id} screen={screen} busy={busyId === screen.id}
              onLayout={changeLayout(screen)} onRename={rename(screen)} onRotate={rotate(screen)} onDelete={remove(screen)} />
          ))}
        </ul>
      ) : null}

      {shown ? <LinkDialog link={shown.link} screenName={shown.name} onClose={() => setShown(null)} /> : null}
    </div>
  );
}
