import React, { useCallback, useEffect, useState } from "react";
import { listTrash, purgeTrash, restoreTrash } from "../../WebServer/services/trash/functionsTrash.jsx";
import { formatDate, formatDateTime } from "../../generated/dateFormat";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import EmptyState from "../UI/EmptyState";
import styles from "./Trash.module.css";

// «سلة المحذوفات» (owner, 2026-11-16): deleted students, vehicles and staff,
// kept 30 days. «استعادة» puts one back; «حذف نهائي» asks first and cannot be
// undone. Each kind shows only to whoever may delete it; «حذف نهائي» only to
// whoever holds that kind's purge key (the server says so per row, 2026-11-18).
const KIND_TEXT = { student: "طالب", vehicle: "مركبة", user: "عضو طاقم", nasheed: "نشيد" };

export default function TrashPage() {
  const [state, setState] = useState({ loading: true, items: [], error: "" });
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const res = await listTrash();
    setState(res.ok ? { loading: false, items: res.items || [], error: "" } : { loading: false, items: [], error: res.message });
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (key, fn, done) => {
    setBusy(key);
    const res = await fn();
    setBusy("");
    if (!res.ok) return toast.warn(res.message);
    toast.success(done);
    return load();
  };
  const restore = (item) => act(`r${item.id}`, () => restoreTrash(item.id), `تمت استعادة «${item.label}»`);
  const purge = async (item) => {
    const ok = await ask("delete", {
      title: "حذف نهائي",
      message: `سيُحذف «${item.label}» نهائيًا مع ملفاته، ولا يمكن التراجع. هل تريد المتابعة؟`,
    }).catch(() => false);
    if (ok) await act(`p${item.id}`, () => purgeTrash(item.id), `حُذف «${item.label}» نهائيًا`);
  };

  return (
    <div className={styles.page}>
      <h1>سلة المحذوفات</h1>
      <p className={styles.intro}>ما حُذف من الطلاب والمركبات والطاقم يبقى هنا 30 يومًا، ثم يُحذف نهائيًا.</p>
      {state.loading ? <p role="status">…</p>
        : state.error ? <p role="alert">{state.error}</p>
        : state.items.length === 0 ? <EmptyState icon="trash" title="سلة المحذوفات فارغة" hint="ما تحذفه يظهر هنا 30 يومًا." />
        : (
          <ul className={styles.list}>
            {state.items.map((item) => (
              <li key={item.id} className={styles.item}>
                <span className={styles.kind}>{KIND_TEXT[item.kind] || item.kind}</span>
                <span className={styles.main}>
                  <span className={styles.label}>{item.label}</span>
                  <span className={styles.meta}>
                    حُذف {formatDateTime(item.deletedAt)}{item.deletedBy ? ` بواسطة ${item.deletedBy}` : ""} · يُحذف نهائيًا في {formatDate(item.expiresAt)}
                  </span>
                </span>
                <span className={styles.actions}>
                  <Button onClick={() => restore(item)} loading={busy === `r${item.id}`} disabled={Boolean(busy)}>استعادة</Button>
                  {item.canPurge && <Button variant="danger" onClick={() => purge(item)} loading={busy === `p${item.id}`} disabled={Boolean(busy)}>حذف نهائي</Button>}
                </span>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
