import * as api from "../api";
import { toast } from "./toast.jsx";
import { navigate } from "../router.jsx";

export const UNDO_MS = 8000;

// Asks first (the phone's own dialog: it works the same on every phone).
export const confirmDelete = async (title) => window.confirm(`حذف النشيد «${title}»؟ يمكن التراجع خلال ثوانٍ، أو استعادته من «سلة المحذوفات» في النظام الرئيسي خلال 30 يومًا.`);

// Deletes, then offers «تراجع» for 8 seconds, as in the main system. True
// when the nasheed was deleted.
export async function deleteWithUndo(nasheed) {
  const res = await api.deleteNasheed(nasheed._id);
  if (!res.ok) { toast.error(api.errorText(res)); return false; }
  const trashId = res.data.trashId;
  toast.success("نُقل النشيد إلى سلة المحذوفات", {
    duration: UNDO_MS,
    action: {
      label: "تراجع",
      onClick: async () => {
        const back = await api.restoreNasheed(trashId);
        if (!back.ok) { toast.error(api.errorText(back)); return; }
        toast.success("أُعيد النشيد");
        navigate(`/n/${back.data.id || nasheed._id}`);
      },
    },
  });
  return true;
}
