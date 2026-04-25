import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./FilesPage.module.css";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { API_BASE_URL } from "../../WebServer/services/api";
import {
  createStorageFolder,
  deleteStorageFile,
  getStorageEntries,
  getStorageFileUrl,
  renameStorageFile,
  uploadStorageFile,
} from "../../WebServer/services/storage/functionsStorage";

const formatBytes = (bytes) => {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return "-";
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)}${units[unit]}`;
};

  const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ar", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getExtension = (name = "") => {
  const parts = String(name).split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
};

const getType = (file) => {
  const extension = getExtension(file.name || file.filename);
  const type = String(file.type || "").toLowerCase();

  if (type.includes("pdf") || extension === "pdf") return "pdf";
  if (type.includes("image") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) return "image";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(extension)) return "office";
  return "other";
};

const typeLabel = {
  pdf: "PDF",
  image: "صورة",
  office: "Office",
  other: "ملف",
};

const formatDuration = (ms) => {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s`;
};

export default function FilesPage() {
  const inputRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const [items, setItems] = useState([]);
  const [currentPath, setCurrentPath] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");

  const loadFiles = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getStorageEntries(currentPath);
      setItems(data.items || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر جلب الملفات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [currentPath]);

  useEffect(() => {
    const events = new EventSource(`${API_BASE_URL}/events`);

    events.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        if (payload?.type !== "storage") return;

        if (refreshTimerRef.current) {
          window.clearTimeout(refreshTimerRef.current);
        }

        refreshTimerRef.current = window.setTimeout(() => {
          loadFiles();
        }, 250);
      } catch (parseError) {
        console.error("storage events parse error", parseError);
      }
    };

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      events.close();
    };
  }, [currentPath]);

  const pathParts = useMemo(() => currentPath.split("/").filter(Boolean), [currentPath]);
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((file) =>
      String(file.name || file.filename || "").toLowerCase().includes(q)
    );
  }, [items, query]);

  const notifyActionTime = (label, startedAt) => {
    const elapsed = performance.now() - startedAt;
    const formatted = formatDuration(elapsed);
    console.info(`${label}: ${formatted}`);
    toast.success(`${label}: ${formatted}`);
  };

  const uploadFile = async (file) => {
    if (!file) return;

    const customName = window.prompt("اسم الملف", file.name);
    if (customName === null) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    setError("");
    const startedAt = performance.now();

    try {
      await uploadStorageFile(file, currentPath, customName.trim());
      await loadFiles();
      notifyActionTime("تم رفع الملف خلال", startedAt);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر رفع الملف");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    uploadFile(event.dataTransfer.files?.[0]);
  };

  const handleDelete = async (file) => {
    const filename = file.path || file.filename || file.name;
    if (!filename) return;

    if (!window.confirm(`هل تريد حذف "${file.name || filename}"؟`)) return;

    setError("");
    const startedAt = performance.now();

    try {
      await deleteStorageFile(filename);
      await loadFiles();
      notifyActionTime("تم حذف الملف خلال", startedAt);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر حذف الملف");
    }
  };

  const handleRename = async (file) => {
    const filename = file.path || file.filename || file.name;
    if (!filename) return;

    const newName = window.prompt("الاسم الجديد", file.name || filename);
    if (!newName?.trim()) return;

    setError("");
    const startedAt = performance.now();

    try {
      await renameStorageFile(filename, newName.trim());
      await loadFiles();
      notifyActionTime("تم تغيير الاسم خلال", startedAt);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر تغيير الاسم");
    }
  };

  const createFolder = async () => {
    const name = window.prompt("اسم المجلد الجديد");
    if (!name?.trim()) return;

    setError("");

    try {
      await createStorageFolder({ path: currentPath, name: name.trim() });
      await loadFiles();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر إنشاء المجلد");
    }
  };

  const openFolder = (file) => {
    if (!file.isDirectory) return;
    setCurrentPath(file.path || file.filename || file.name);
    setQuery("");
  };

  const goToPathIndex = (index) => {
    if (index < 0) {
      setCurrentPath("");
      return;
    }

    setCurrentPath(pathParts.slice(0, index + 1).join("/"));
  };

  const openFile = (file) => {
    const filename = file.url || file.filename || file.name;
    if (!filename) return;
    window.open(getStorageFileUrl(filename), "_blank", "noopener,noreferrer");
  };

  return (
    <main
      className={`${styles.shell} ${dragActive ? styles.dragActive : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      dir="rtl"
    >
      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <div className={styles.breadcrumb}>
              <button onClick={() => goToPathIndex(-1)}>\</button>
              {pathParts.map((part, index) => (
                <button key={`${part}-${index}`} onClick={() => goToPathIndex(index)}>
                  {part} \
                </button>
              ))}
            </div>
            <h2>ملفات</h2>
          </div>

          <div className={styles.actions}>
            <button className={styles.secondaryBtn} onClick={loadFiles} disabled={loading || uploading}>
              تحديث
            </button>
            <button className={styles.secondaryBtn} onClick={createFolder} disabled={loading || uploading}>
              إنشاء مجلد
            </button>
            <label className={styles.primaryBtn}>
              {uploading ? "جارٍ الرفع..." : "رفع ملف"}
              <input
                ref={inputRef}
                className={styles.fileInput}
                type="file"
                onChange={(event) => uploadFile(event.target.files?.[0])}
                disabled={uploading}
              />
            </label>
          </div>
        </header>

        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="بحث في الملفات..."
          />
        </div>

        {dragActive && <div className={styles.dropOverlay}>اترك الملف هنا للرفع</div>}
        {error && <div className={styles.error}>{error}</div>}
        {loading && <div className={styles.empty}>جار تحميل الملفات...</div>}

        {!loading && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>النوع</th>
                  <th>الحجم</th>
                  <th>التاريخ</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {!filteredItems.length && (
                  <tr>
                    <td colSpan="5" className={styles.emptyCell}>لا توجد ملفات</td>
                  </tr>
                )}

                {filteredItems.map((file) => {
                  
                  const filenamewithExt = file.name;
                  console.log("filenamewithExt", filenamewithExt);
                  const filename = filenamewithExt.split(`${file.type}`);
                  console.log("filename", filename);
                  const extension = file.isDirectory ? "DIR" : getExtension(file.filename).toUpperCase() || "FILE";
                  const type = getType(file);

                  return (
                    <tr key={filename}>
                      <td>
                        <div className={styles.nameCell}>
                          <span className={styles.fileBadge}>{extension}</span>
                          <button
                            className={styles.nameButton}
                            style={{ fontSize: "2em"  }}
                            onClick={() => (file.isDirectory ? openFolder(file) : openFile(file))}
                          >
                            {filename}
                          </button>
                        </div>
                      </td>
                      <td>{file.isDirectory ? "مجلد" : typeLabel[type]}</td>
                      <td>{file.isDirectory ? "-" : formatBytes(file.size)}</td>
                      <td>{formatDate(file.date)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          {file.isDirectory ? (
                            <>
                              <button onClick={() => openFolder(file)}>فتح</button>
                              <button onClick={() => handleRename(file)}>تغيير الاسم</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => openFile(file)}>فتح</button>
                              <button onClick={() => handleRename(file)}>تغيير الاسم</button>
                            </>
                          )}
                          <button className={styles.deleteBtn} onClick={() => handleDelete(file)}>حذف</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
