import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import { Link, navigate } from "../router.jsx";
import { confirmDelete, deleteWithUndo } from "../ui/deleteNasheed";

// Adding or editing a nasheed (owner, 2026-11-27): the title, then one row
// per line. A verse row has two fields (صدر on the right, عجز on the left), a
// centered row one field, a break row shows ***. Rows are added at the end,
// moved up or down, or removed. Tashkeel is kept as typed. Empty rows are
// dropped on save; the server checks the same rules again.
const LIMITS = { title: 120, text: 200, lines: 300 };

let nextKey = 1;
const withKey = (line) => ({ ...line, key: nextKey++ });
const blank = (kind) => withKey(kind === "verse" ? { kind, sadr: "", ajuz: "" } : kind === "center" ? { kind, text: "" } : { kind });

// The lines to send, or { error, focus } for the first problem.
function check(title, rows) {
  if (!title.trim()) return { error: "العنوان مطلوب", focus: "title" };
  if (title.trim().length > LIMITS.title) return { error: `العنوان أطول من ${LIMITS.title} حرفًا`, focus: "title" };
  const lines = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const n = i + 1;
    if (row.kind === "verse") {
      const sadr = row.sadr.trim();
      const ajuz = row.ajuz.trim();
      if (!sadr && !ajuz) continue;
      if (!sadr) return { error: `البيت ${n} يحتاج الصدر والعجز`, focus: `sadr-${row.key}` };
      if (!ajuz) return { error: `البيت ${n} يحتاج الصدر والعجز`, focus: `ajuz-${row.key}` };
      if (sadr.length > LIMITS.text) return { error: `صدر البيت ${n} أطول من ${LIMITS.text} حرفًا`, focus: `sadr-${row.key}` };
      if (ajuz.length > LIMITS.text) return { error: `عجز البيت ${n} أطول من ${LIMITS.text} حرفًا`, focus: `ajuz-${row.key}` };
      lines.push({ kind: "verse", sadr, ajuz });
    } else if (row.kind === "center") {
      const text = row.text.trim();
      if (!text) continue;
      if (text.length > LIMITS.text) return { error: `السطر ${n} أطول من ${LIMITS.text} حرفًا`, focus: `text-${row.key}` };
      lines.push({ kind: "center", text });
    } else {
      lines.push({ kind: "break" });
    }
  }
  if (!lines.some((line) => line.kind !== "break")) {
    const first = rows.find((row) => row.kind !== "break");
    return { error: "اكتب سطرًا واحدًا على الأقل", focus: first ? `${first.kind === "verse" ? "sadr" : "text"}-${first.key}` : null };
  }
  if (lines.length > LIMITS.lines) return { error: `النشيد أطول من ${LIMITS.lines} سطرًا`, focus: null };
  return { lines };
}

export default function Edit({ id }) {
  const editing = Boolean(id);
  const [loaded, setLoaded] = useState(!editing);
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState(() => [blank("verse")]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useRef(null);

  useEffect(() => {
    if (!editing) return undefined;
    let alive = true;
    api.getPublic(id).then((res) => {
      if (!alive) return;
      if (!res.ok) { setError(api.errorText(res, { NOT_FOUND: "النشيد غير موجود" })); return; }
      const n = res.data.nasheed;
      setTitle(n.title);
      setRows((n.lines || []).map(withKey));
      setUpdatedAt(n.updatedAt);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [editing, id]);

  const setRow = (key, patch) => setRows((list) => list.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const move = (index, by) => setRows((list) => {
    const next = [...list];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row);
    return next;
  });
  const removeRow = (key) => setRows((list) => list.filter((row) => row.key !== key));
  const add = (kind) => setRows((list) => (list.length >= LIMITS.lines ? list : [...list, blank(kind)]));
  const focus = (name) => {
    const el = name && form.current?.querySelector(`[data-field="${name}"]`);
    el?.focus();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const result = check(title, rows);
    if (result.error) { setError(result.error); focus(result.focus); return; }
    setBusy(true);
    setError("");
    const body = { title: title.trim(), lines: result.lines };
    const res = editing ? await api.updateNasheed(id, { ...body, updatedAt }) : await api.createNasheed(body);
    setBusy(false);
    if (!res.ok) { setError(api.errorText(res)); return; }
    navigate(`/n/${res.data.nasheed._id}`);
  };

  const remove = async () => {
    if (!(await confirmDelete(title))) return;
    if (await deleteWithUndo({ _id: id, title })) navigate("/");
  };

  if (editing && !loaded) {
    return error
      ? <section className="page"><p role="alert" className="error">{error}</p><Link to="/">كل الأناشيد</Link></section>
      : <p className="center muted">جارٍ التحميل…</p>;
  }

  return (
    <section className="page">
      <p className="back"><Link to={editing ? `/n/${id}` : "/"}>{editing ? "العودة إلى النشيد" : "كل الأناشيد"}</Link></p>
      <h1>{editing ? "تعديل نشيد" : "إضافة نشيد"}</h1>
      <form ref={form} className="edit-form" onSubmit={submit} noValidate aria-describedby={error ? "edit-error" : undefined}>
        <label htmlFor="title">العنوان
          <input id="title" data-field="title" value={title} maxLength={LIMITS.title + 20} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <ol className="line-rows" aria-label="أسطر النشيد">
          {rows.map((row, i) => {
            const n = i + 1;
            return (
              <li key={row.key} className="line-row" data-kind={row.kind}>
                <div className="line-fields">
                  {row.kind === "verse" && (
                    <>
                      <input aria-label={`صدر البيت ${n}`} placeholder="الصدر" data-field={`sadr-${row.key}`} value={row.sadr} onChange={(e) => setRow(row.key, { sadr: e.target.value })} />
                      <input aria-label={`عجز البيت ${n}`} placeholder="العجز" data-field={`ajuz-${row.key}`} value={row.ajuz} onChange={(e) => setRow(row.key, { ajuz: e.target.value })} />
                    </>
                  )}
                  {row.kind === "center" && (
                    <input aria-label={`السطر ${n} في الوسط`} placeholder="سطر في الوسط" data-field={`text-${row.key}`} value={row.text} onChange={(e) => setRow(row.key, { text: e.target.value })} />
                  )}
                  {row.kind === "break" && <span aria-label={`فاصل ${n}`}>***</span>}
                </div>
                <div className="line-tools">
                  <button type="button" aria-label={`تحريك السطر ${n} للأعلى`} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                  <button type="button" aria-label={`تحريك السطر ${n} للأسفل`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>▼</button>
                  <button type="button" aria-label={`حذف السطر ${n}`} onClick={() => removeRow(row.key)}>✕</button>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="add-row">
          <button type="button" onClick={() => add("verse")}>+ بيت</button>
          <button type="button" onClick={() => add("center")}>+ سطر في الوسط</button>
          <button type="button" onClick={() => add("break")}>+ فاصل</button>
        </div>
        {error && <p id="edit-error" role="alert" className="error">{error}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</button>
          {editing && <button type="button" className="danger" onClick={remove}>حذف النشيد</button>}
        </div>
      </form>
    </section>
  );
}
