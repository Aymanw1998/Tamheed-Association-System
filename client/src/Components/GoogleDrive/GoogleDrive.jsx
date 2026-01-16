import React, { useEffect, useMemo, useState } from "react";
import {
  listDrive,
  uploadDrive,
  deleteDriveItem,
  createDriveFolder,
  renameDriveItem,
  downloadDrive,
} from "../../WebServer/services/googleDrive/functionGoogleDrive.jsx";

const isFolder = (item) => item?.mimeType === "application/vnd.google-apps.folder";

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("he-IL");
};

const formatSize = (size) => {
  if (!size) return "";
  const n = Number(size);
  if (Number.isNaN(n)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v = v / 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export default function PageDrive() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [onlyFolders, setOnlyFolders] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [pickedFile, setPickedFile] = useState(null);

  const [newFolderName, setNewFolderName] = useState("");

  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((x) => (onlyFolders ? isFolder(x) : true))
      .filter((x) => (q ? (x?.name || "").toLowerCase().includes(q) : true));
  }, [items, query, onlyFolders]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await listDrive();
      if (res?.ok) setItems(res.data || []);
      else alert(res?.msg || "שגיאה בטעינת קבצים");
    } catch (e) {
      alert(e?.message || "שגיאה בטעינת קבצים");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onUpload = async () => {
    if (!pickedFile) return alert("בחרי קובץ קודם");
    try {
      setUploading(true);
      const res = await uploadDrive(pickedFile);
      if (!res?.ok) return alert(res?.msg || "העלאה נכשלה");
      setPickedFile(null);
      await load();
      alert("הקובץ הועלה ✅");
    } catch (e) {
      alert(e?.message || "העלאה נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id, name) => {
    const ok = window.confirm(`למחוק את "${name}"?`);
    if (!ok) return;
    try {
      const res = await deleteDriveItem(id);
      if (!res?.ok) return alert(res?.msg || "מחיקה נכשלה");
      await load();
    } catch (e) {
      alert(e?.message || "מחיקה נכשלה");
    }
  };

  const onCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return alert("תני שם לתיקייה");
    try {
      const res = await createDriveFolder(name);
      if (!res?.ok) return alert(res?.msg || "יצירת תיקייה נכשלה");
      setNewFolderName("");
      await load();
      alert("תיקייה נוצרה ✅");
    } catch (e) {
      alert(e?.message || "יצירת תיקייה נכשלה");
    }
  };

  const startRename = (item) => {
    setRenameId(item.id);
    setRenameValue(item.name || "");
  };

  const cancelRename = () => {
    setRenameId(null);
    setRenameValue("");
  };

  const saveRename = async () => {
    const newName = renameValue.trim();
    if (!newName) return alert("שם חדש לא יכול להיות ריק");
    try {
      const res = await renameDriveItem(renameId, newName);
      if (!res?.ok) return alert(res?.msg || "שינוי שם נכשל");
      cancelRename();
      await load();
    } catch (e) {
      alert(e?.message || "שינוי שם נכשל");
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Google Drive – ניהול קבצים</h2>
        <button onClick={load} disabled={loading}>
          {loading ? "טוען..." : "רענון"}
        </button>
      </div>

      {/* Controls */}
      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 10,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        {/* Search / filters */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם..."
            style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={onlyFolders} onChange={(e) => setOnlyFolders(e.target.checked)} />
            רק תיקיות
          </label>
        </div>

        {/* Create folder */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="שם תיקייה חדשה"
            style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <button onClick={onCreateFolder} disabled={!newFolderName.trim() || loading}>
            צור תיקייה
          </button>
        </div>

        {/* Upload */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="file"
            onChange={(e) => setPickedFile(e.target.files?.[0] || null)}
            style={{ flex: 1 }}
          />
          <button onClick={onUpload} disabled={!pickedFile || uploading}>
            {uploading ? "מעלה..." : "העלה"}
          </button>
        </div>

        {/* Rename modal-ish */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
          {renameId ? (
            <>
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="שם חדש..."
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", minWidth: 260 }}
              />
              <button onClick={saveRename} disabled={!renameValue.trim()}>
                שמור
              </button>
              <button onClick={cancelRename}>ביטול</button>
            </>
          ) : (
            <span style={{ opacity: 0.7 }}>לחצי “שינוי שם” ליד פריט כדי לערוך</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: 10, background: "#f7f7f7", display: "flex", justifyContent: "space-between" }}>
          <div>
            סה״כ: <b>{filtered.length}</b>
          </div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            * הפעולות מתבצעות בתוך התיקייה שהגדרת ב-DRIVE_FOLDER_ID
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", background: "#fafafa" }}>
              <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>סוג</th>
              <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>שם</th>
              <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>גודל</th>
              <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>עודכן</th>
              <th style={{ padding: 10, borderBottom: "1px solid #eee", width: 340 }}>פעולות</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: 10 }}>{isFolder(item) ? "📁 תיקייה" : "📄 קובץ"}</td>
                <td style={{ padding: 10, fontWeight: 600 }}>{item.name}</td>
                <td style={{ padding: 10 }}>{isFolder(item) ? "-" : formatSize(item.size)}</td>
                <td style={{ padding: 10 }}>{formatDate(item.modifiedTime)}</td>
                <td style={{ padding: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!isFolder(item) && (
                      <button onClick={() => downloadDrive(item.id)}>הורדה</button>
                    )}
                    <button onClick={() => startRename(item)}>שינוי שם</button>
                    <button onClick={() => onDelete(item.id, item.name)} style={{ color: "#b00020" }}>
                      מחיקה
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 18, textAlign: "center", opacity: 0.7 }}>
                  אין פריטים להצגה
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={5} style={{ padding: 18, textAlign: "center" }}>
                  טוען נתונים...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
