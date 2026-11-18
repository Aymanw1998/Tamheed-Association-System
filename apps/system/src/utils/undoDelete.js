import { toast } from "../ALERT/SystemToasts";
import { restoreTrash } from "../WebServer/services/trash/functionsTrash.jsx";

// After a delete (owner, 2026-11-16): no "are you sure?" first; instead the
// toast offers "تراجع" for 8 seconds. Afterwards the record is still in
// «سلة المحذوفات» for 30 days.
export const UNDO_MS = 8000;

export function offerUndo({ trashId, message, onRestored }) {
  if (!trashId) return toast.success(message);
  const undo = async () => {
    const res = await restoreTrash(trashId);
    if (!res.ok) return toast.warn(res.message);
    toast.success("تمت الاستعادة");
    if (typeof onRestored === "function") onRestored();
    return undefined;
  };
  return toast.success(message, { duration: UNDO_MS, action: { label: "تراجع", icon: "undo", onClick: undo } });
}
