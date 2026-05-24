import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./FilesPage.module.css";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { API_BASE_URL } from "../../WebServer/services/api";
import {
  cancelStorageUpload,
  createStorageFolder,
  deleteStorageFile,
  downloadSharedStorageFile,
  downloadStorageFile,
  getStorageEntries,
  getStorageShareStatus,
  getStorageShareLinkInfo,
  getStorageSharedEntries,
  getStorageStats,
  openSharedStorageFile,
  openStorageFile,
  renameStorageFile,
  shareStorageEntry,
  unshareStorageEntry,
  uploadStorageFileAuto,
} from "../../WebServer/services/storage/functionsStorage";
import { getAll as getAllUsers } from "../../WebServer/services/user/functionsUser";
import { getStoredUserId } from "../../utils/session";
import { useI18n } from "../../i18n/I18nContext";

const formatBytes = (bytes) => {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return "-";
  const value = Number(bytes);
  if (value < 1024) return `${value}B`;

  const units = ["KiB", "MiB", "GiB", "TiB"];
  let size = value / 1024;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
};

const formatDate = (value, locale = "ar") => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(locale, {
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
  const type = String(file.type || file.mimeType || "").toLowerCase();

  if (type.includes("pdf") || extension === "pdf") return "pdf";
  if (type.includes("image") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
    return "image";
  }
  if (type.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(extension)) return "excel";
  if (type.includes("presentation") || ["ppt", "pptx"].includes(extension)) return "powerpoint";
  if (type.includes("word") || ["doc", "docx"].includes(extension)) return "word";
  if (type.includes("video") || ["mp4", "mov", "avi", "mkv", "webm"].includes(extension)) return "video";
  if (type.includes("audio") || ["mp3", "wav", "m4a", "ogg"].includes(extension)) return "audio";
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) return "archive";
  if (["txt", "md", "rtf"].includes(extension)) return "text";
  if (["js", "jsx", "ts", "tsx", "html", "css", "json", "xml"].includes(extension)) return "code";
  return "other";
};

const fileTypeMeta = {
  pdf: { label: "PDF", badge: "PDF", mark: "PDF", iconClass: "documentIconPdf" },
  image: { label: "صورة", badge: "IMG", mark: "IMG", iconClass: "documentIconImage" },
  word: { label: "Word", badge: "DOC", mark: "W", iconClass: "documentIconWord" },
  excel: { label: "Excel", badge: "XLS", mark: "X", iconClass: "documentIconExcel" },
  powerpoint: { label: "PowerPoint", badge: "PPT", mark: "P", iconClass: "documentIconPowerpoint" },
  video: { label: "فيديو", badge: "VID", mark: "VID", iconClass: "documentIconVideo" },
  audio: { label: "صوت", badge: "AUD", mark: "AUD", iconClass: "documentIconAudio" },
  archive: { label: "أرشيف", badge: "ZIP", mark: "ZIP", iconClass: "documentIconArchive" },
  text: { label: "نص", badge: "TXT", mark: "TXT", iconClass: "documentIconText" },
  code: { label: "كود", badge: "DEV", mark: "</>", iconClass: "documentIconCode" },
  other: { label: "ملف", badge: "FILE", mark: "FILE", iconClass: "documentIconOther" },
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

const readShareToken = () => {
  try {
    return new URLSearchParams(window.location.search).get("shareToken") || "";
  } catch {
    return "";
  }
};

const getDisplayName = (file = {}) => file.displayName || file.name || file.filename || "-";

const joinStoragePath = (base = "", name = "") =>
  [base, name]
    .map((part) => String(part || "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");

const getItemKey = (file = {}) =>
  String(file._tempKey || file.path || file.filename || file.relativePath || file.name || file.displayName || "").trim();

const removeItemByKey = (list = [], key = "") =>
  list.filter((item) => getItemKey(item) !== key);

const upsertItem = (list = [], item = {}) => {
  const key = getItemKey(item);
  if (!key) return list;

  const exists = list.some((current) => getItemKey(current) === key);
  if (!exists) return [item, ...list];

  return list.map((current) =>
    getItemKey(current) === key ? { ...current, ...item } : current
  );
};

const replaceBaseName = (value = "", newName = "") => {
  const parts = String(value || "").split("/").filter(Boolean);
  if (!parts.length) return newName;
  parts[parts.length - 1] = newName;
  return parts.join("/");
};

const normalizeUploadResultItem = (result = {}, fallback = {}) => {
  const source = result?.file || result?.item || result?.storage?.file || result || {};
  const name =
    source.name ||
    source.displayName ||
    source.fileName ||
    source.filename?.split("/")?.pop?.() ||
    fallback.name ||
    "file";
  const itemPath =
    source.path ||
    source.relativePath ||
    source.filename ||
    result?.path ||
    result?.relativePath ||
    joinStoragePath(fallback.path, name);

  return {
    ...source,
    name,
    displayName: source.displayName || name,
    filename: source.filename || itemPath,
    path: itemPath,
    size: source.size ?? result?.size ?? fallback.size ?? null,
    date: source.date || source.modifiedAt || source.createdAt || new Date().toISOString(),
    type: source.type || source.mimeType || source.mimetype || fallback.type || "",
    isDirectory: Boolean(source.isDirectory),
  };
};

const createOptimisticFolder = (name = "", currentPath = "") => {
  const folderPath = joinStoragePath(currentPath, name);
  return {
    name,
    displayName: name,
    filename: folderPath,
    path: folderPath,
    type: "folder",
    isDirectory: true,
    size: 0,
    date: new Date().toISOString(),
    _pending: "creating",
  };
};

const renameItemOptimistic = (file = {}, newName = "") => ({
  ...file,
  name: newName,
  displayName: newName,
  filename: replaceBaseName(file.filename || file.path || file.name, newName),
  path: replaceBaseName(file.path || file.filename || file.name, newName),
  date: new Date().toISOString(),
  _pending: "renaming",
});

const pendingLabel = {
  uploading: "جار الرفع",
  chunking: "رفع مجزأ",
  processing: "جار المعالجة",
  creating: "جار الإنشاء",
  renaming: "جار التسمية",
};

const MAX_PARALLEL_UPLOADS = 2;
const activeUploadStatuses = new Set(["queued", "uploading", "chunking", "processing"]);
const shareRoleOptions = [
  { value: "read", label: "قراءة" },
  { value: "write", label: "تعديل" },
  { value: "manage", label: "تعديل ومشاركة" },
];

const getShareRoleLabel = (role = "read") =>
  shareRoleOptions.find((option) => option.value === role)?.label || shareRoleOptions[0].label;

export default function FilesPage() {
  const { dir, language, t } = useI18n();
  const inputRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const contextMenuRef = useRef(null);
  const uploadControllersRef = useRef(new Map());
  const uploadSessionsRef = useRef(new Map());
  const uploadCanceledRef = useRef(new Set());
  const uploadJobsRef = useRef([]);
  const activeUploadCountRef = useRef(0);
  const shareToken = useMemo(() => readShareToken(), []);
  const currentUserId = useMemo(() => String(getStoredUserId() || "").trim(), []);
  const isSharedView = Boolean(shareToken);

  const [items, setItems] = useState([]);
  const [currentPath, setCurrentPath] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [shareInfo, setShareInfo] = useState(null);
  const [shareModalFile, setShareModalFile] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [shareRole, setShareRole] = useState("read");
  const [sharedUsersMap, setSharedUsersMap] = useState({});
  const [contextMenu, setContextMenu] = useState(null);
  const [storageStats, setStorageStats] = useState(null);
  const [uploadQueue, setUploadQueue] = useState([]);

  const loadShareUsers = async () => {
    setUsersLoading(true);
    try {
      const [result, shareStatus] = await Promise.all([
        getAllUsers(["active"]),
        shareModalFile ? getStorageShareStatus(shareModalFile) : Promise.resolve({ sharedWith: [] }),
      ]);

      if (result?.ok) {
        setUsers(result.users || []);
      } else {
        setError(result?.message || "تعذر تحميل المستخدمين");
      }

      const nextSharedUsers = {};
      (shareStatus?.sharedWith || []).forEach((entry) => {
        nextSharedUsers[String(entry?.tz || "").trim()] = entry;
      });
      setSharedUsersMap(nextSharedUsers);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر تحميل المستخدمين");
    } finally {
      setUsersLoading(false);
    }
  };

  const loadShareInfo = async () => {
    if (!isSharedView) return;

    try {
      const data = await getStorageShareLinkInfo(shareToken);
      setShareInfo(data?.item || null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر فتح رابط المشاركة");
    }
  };

  const loadStorageStats = async () => {
    if (isSharedView) return;

    try {
      const data = await getStorageStats(currentPath);
      setStorageStats(data || null);
    } catch (err) {
      console.error("storage stats error", err);
    }
  };

  const loadFiles = async ({ silentError = false } = {}) => {
    if (!silentError) setLoading(true);
    if (!silentError) setError("");

    try {
      if (isSharedView) {
        const data = await getStorageSharedEntries(shareToken, currentPath);
        setItems(data.items || []);
      } else {
        const data = await getStorageEntries(currentPath);
        setItems(data.items || []);
        loadStorageStats();
      }
    } catch (err) {
      const message = err?.response?.data?.message || err.message || "تعذر جلب الملفات";
      if (silentError) {
        console.warn("[storage] refresh-after-upload:error", {
          status: err?.response?.status,
          message,
        });
      } else {
        setError(message);
      }
    } finally {
      if (!silentError) setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [currentPath, shareToken]);

  useEffect(() => {
    loadShareInfo();
  }, [shareToken]);

  useEffect(() => {
    if (shareModalFile) {
      setShareRole("read");
      loadShareUsers();
    }
  }, [shareModalFile]);

  useEffect(() => {
    if (!contextMenu) return undefined;

    const closeMenu = (event) => {
      if (contextMenuRef.current?.contains(event.target)) return;
      setContextMenu(null);
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setContextMenu(null);
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("contextmenu", closeMenu);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("contextmenu", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (isSharedView) return undefined;

    const events = new EventSource(`${API_BASE_URL}/events`);

    events.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        if (payload?.type !== "storage") return;

        if (refreshTimerRef.current) {
          window.clearTimeout(refreshTimerRef.current);
        }

        refreshTimerRef.current = window.setTimeout(() => {
          loadFiles({ silentError: true });
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
  }, [currentPath, isSharedView]);

  const pathParts = useMemo(() => currentPath.split("/").filter(Boolean), [currentPath]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((file) =>
      String(`${file.displayName || ""} ${file.name || ""} ${file.filename || ""} ${file.ownerName || ""}`)
        .toLowerCase()
        .includes(q)
    );
  }, [items, query]);

  const visibleFolders = useMemo(
    () =>
      filteredItems
        .filter((file) => file.isDirectory)
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b), "ar", { numeric: true })),
    [filteredItems]
  );

  const visibleFiles = useMemo(
    () =>
      filteredItems
        .filter((file) => !file.isDirectory)
        .sort((a, b) => {
          const typeCompare = getType(a).localeCompare(getType(b), "en");
          if (typeCompare) return typeCompare;
          return getDisplayName(a).localeCompare(getDisplayName(b), "ar", { numeric: true });
        }),
    [filteredItems]
  );

  const explorerItems = useMemo(
    () => [...visibleFolders, ...visibleFiles],
    [visibleFolders, visibleFiles]
  );

  const folderCount = items.filter((file) => file.isDirectory).length;
  const fileCount = items.length - folderCount;
  const storageTotalBytes = Number(
    storageStats?.displayTotalBytes ??
    storageStats?.tamheedTotalBytes ??
    storageStats?.serverTotalBytes ??
    0
  );
  const storageFreeBytes = Number(
    storageStats?.displayAvailableBytes ??
    storageStats?.serverFreeBytes ??
    storageStats?.tamheedAvailableBytes ??
    0
  );
  const storageUsedBytes = Number(
    storageStats?.displayUsedBytes ??
    storageStats?.serverUsedBytes ??
    Math.max(storageTotalBytes - storageFreeBytes, 0)
  );
  const storageUsagePercent = useMemo(() => {
    if (!storageTotalBytes) return 0;
    return Math.min(100, Math.max(0, Math.round((storageUsedBytes / storageTotalBytes) * 100)));
  }, [storageTotalBytes, storageUsedBytes]);
  const isInitialLoading = loading && !items.length;
  const isRefreshing = loading && items.length > 0;

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const visibleUsers = users.filter((user) => String(user?._id || "").trim() !== currentUserId);
    if (!q) return visibleUsers;

    return visibleUsers.filter((user) =>
      [user.firstname, user.lastname, user.tz, user.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [users, userSearch, currentUserId]);

  const notifyActionTime = (label, startedAt) => {
    const elapsed = performance.now() - startedAt;
    const formatted = formatDuration(elapsed);
    console.info(`${label}: ${formatted}`);
    toast.success(`${label}: ${formatted}`);
  };

  const syncUploadQueue = (updater) => {
    const next = typeof updater === "function" ? updater(uploadJobsRef.current) : updater;
    uploadJobsRef.current = next;
    setUploadQueue(next);
    setUploading(next.some((job) => activeUploadStatuses.has(job.status)));
  };

  const updateUploadJob = (jobId, patch) => {
    syncUploadQueue((prev) => prev.map((job) => job.id === jobId ? { ...job, ...patch } : job));
  };

  const getUploadPhase = (event, percent) => {
    if (percent >= 99) return "processing";
    if (event.totalChunks) return "chunking";
    return "uploading";
  };

  const runUploadJob = async (job) => {
    const abortController = new AbortController();
    uploadControllersRef.current.set(job.id, abortController);
    uploadCanceledRef.current.delete(job.id);

    const startedAt = performance.now();
    const pendingUpload = {
      _tempKey: job.id,
      name: job.fileName,
      displayName: job.fileName,
      filename: joinStoragePath(job.path, job.fileName),
      path: joinStoragePath(job.path, job.fileName),
      size: job.file.size || 0,
      type: job.file.type || "",
      date: new Date().toISOString(),
      isDirectory: false,
      _pending: "uploading",
      _uploadPercent: 0,
    };
    const pendingKey = getItemKey(pendingUpload);

    updateUploadJob(job.id, { status: "uploading", phase: "uploading", percent: 0, loaded: 0 });
    setItems((prev) => upsertItem(prev, pendingUpload));

    try {
      const uploadResult = await uploadStorageFileAuto(job.file, job.path, job.fileName, {
        signal: abortController.signal,
        onFallbackToChunks: () => {
          updateUploadJob(job.id, { status: "chunking", phase: "retrying-chunks", percent: 0, loaded: 0 });
          setItems((prev) => upsertItem(prev, { ...pendingUpload, _pending: "chunking", _uploadPercent: 0 }));
        },
        onUploadSession: (session) => {
          uploadSessionsRef.current.set(job.id, session);
          updateUploadJob(job.id, { uploadId: session.uploadId });
        },
        onUploadProgress: (event) => {
          const total = event.total || job.file.size || 0;
          const loaded = event.loaded || 0;
          const percent = event.percent ?? (total ? Math.min(99, Math.round((loaded / total) * 100)) : 0);
          const phase = getUploadPhase(event, percent);

          updateUploadJob(job.id, {
            status: phase,
            phase: event.totalChunks ? `chunk-${event.chunkIndex + 1}-${event.totalChunks}` : phase,
            loaded,
            total,
            percent,
          });
          setItems((prev) => upsertItem(prev, {
            ...pendingUpload,
            _pending: phase,
            _uploadPercent: percent,
          }));
        },
      });

      const uploadedItem = normalizeUploadResultItem(uploadResult, {
        name: job.fileName,
        path: job.path,
        size: job.file.size || 0,
        type: job.file.type || "",
      });

      if (getItemKey(uploadedItem)) {
        setItems((prev) => upsertItem(removeItemByKey(prev, pendingKey), uploadedItem));
      }

      updateUploadJob(job.id, { status: "done", phase: "done", loaded: job.file.size || 0, percent: 100 });
      loadFiles({ silentError: true });
      notifyActionTime("تم الرفع بنجاح خلال", startedAt);

      window.setTimeout(() => {
        syncUploadQueue((prev) => prev.filter((item) => item.id !== job.id));
      }, 1400);
    } catch (err) {
      setItems((prev) => removeItemByKey(prev, pendingKey));
      if (uploadCanceledRef.current.has(job.id)) {
        updateUploadJob(job.id, { status: "canceled", phase: "canceled", percent: 0 });
        window.setTimeout(() => {
          syncUploadQueue((prev) => prev.filter((item) => item.id !== job.id));
        }, 900);
      } else {
        updateUploadJob(job.id, {
          status: "error",
          phase: "error",
          error: err?.response?.data?.message || err.message || "تعذر رفع الملف",
        });
      }
    } finally {
      uploadControllersRef.current.delete(job.id);
      uploadSessionsRef.current.delete(job.id);
      activeUploadCountRef.current = Math.max(0, activeUploadCountRef.current - 1);
      processUploadQueue();
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const processUploadQueue = () => {
    while (activeUploadCountRef.current < MAX_PARALLEL_UPLOADS) {
      const nextJob = uploadJobsRef.current.find((job) => job.status === "queued");
      if (!nextJob) break;

      activeUploadCountRef.current += 1;
      updateUploadJob(nextJob.id, { status: "uploading", phase: "uploading" });
      runUploadJob(nextJob);
    }
  };

  const enqueueUploads = (files = []) => {
    if (isSharedView) return;
    const acceptedFiles = files.filter(Boolean);
    if (!acceptedFiles.length) return;

    setError("");
    const createdAt = Date.now();
    const jobs = acceptedFiles.map((file, index) => ({
      id: `upload-${createdAt}-${index}-${file.name}`,
      file,
      fileName: file.name,
      path: currentPath,
      loaded: 0,
      total: file.size || 0,
      percent: 0,
      phase: "queued",
      status: "queued",
    }));

    syncUploadQueue((prev) => [...prev, ...jobs]);
    window.setTimeout(processUploadQueue, 0);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    setContextMenu(null);
    if (isSharedView) return;
    enqueueUploads(Array.from(event.dataTransfer.files || []));
  };

  const cancelUploadJob = async (jobId) => {
    uploadCanceledRef.current.add(jobId);
    uploadControllersRef.current.get(jobId)?.abort();

    const session = uploadSessionsRef.current.get(jobId);
    try {
      if (session?.uploadId) {
        await cancelStorageUpload(session.uploadId);
      }
      updateUploadJob(jobId, { status: "canceled", phase: "canceled" });
      setItems((prev) => prev.filter((item) => item._tempKey !== jobId));
      window.setTimeout(() => {
        syncUploadQueue((prev) => prev.filter((item) => item.id !== jobId));
      }, 900);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر إلغاء الرفع");
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  const getContextMenuPosition = (x = 0, y = 0, hasExtraActions = false) => {
    const menuWidth = 220;
    const menuHeight = hasExtraActions ? 220 : 112;
    const safeX = Math.max(12, Math.min(x, window.innerWidth - menuWidth - 12));
    const safeY = Math.max(12, Math.min(y, window.innerHeight - menuHeight - 12));
    return { x: safeX, y: safeY };
  };

  const openContextMenu = (event, file) => {
    event.preventDefault();
    event.stopPropagation();
    const canEditItem = !isSharedView && (!file.shared || ["write", "manage"].includes(file.sharedRole));
    const canManageItem = !isSharedView && (!file.shared || file.sharedRole === "manage");
    const position = getContextMenuPosition(event.clientX, event.clientY, canEditItem || canManageItem);

    setContextMenu({
      x: position.x,
      y: position.y,
      file,
      canEditItem,
      canManageItem,
    });
  };

  const openContextMenuByButton = (event, file) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const canEditItem = !isSharedView && (!file.shared || ["write", "manage"].includes(file.sharedRole));
    const canManageItem = !isSharedView && (!file.shared || file.sharedRole === "manage");
    const position = getContextMenuPosition(rect.left, rect.bottom + 6, canEditItem || canManageItem);

    setContextMenu({
      x: position.x,
      y: position.y,
      file,
      canEditItem,
      canManageItem,
    });
  };

  const handleDelete = async (file) => {
    if (isSharedView) return;
    closeContextMenu();

    if (uploading) {
      setError("يوجد رفع نشط الآن. ألغ الرفع أو انتظر حتى يكتمل قبل الحذف.");
      return;
    }

    const filename = file.path || file.filename || file.name;
    if (!filename) return;

    if (!window.confirm(`هل تريد حذف "${getDisplayName(file)}"؟`)) return;

    setError("");
    const startedAt = performance.now();
    const itemKey = getItemKey(file);
    const previousItems = items;

    if (itemKey) {
      setItems((prev) => removeItemByKey(prev, itemKey));
    }

    try {
      await deleteStorageFile(filename);
      loadFiles({ silentError: true });
      notifyActionTime("تم حذف الملف خلال", startedAt);
    } catch (err) {
      setItems(previousItems);
      setError(err?.response?.data?.message || err.message || "تعذر حذف الملف");
    }
  };

  const handleRename = async (file) => {
    if (isSharedView) return;
    closeContextMenu();

    const filename = file.path || file.filename || file.name;
    if (!filename) return;

    const newName = window.prompt("الاسم الجديد", file.name || filename);
    const cleanName = newName?.trim();
    if (!cleanName) return;

    setError("");
    const startedAt = performance.now();
    const itemKey = getItemKey(file);
    const previousItems = items;
    const optimisticFile = renameItemOptimistic(file, cleanName);

    if (itemKey) {
      setItems((prev) => prev.map((item) => getItemKey(item) === itemKey ? optimisticFile : item));
    }

    try {
      const result = await renameStorageFile(filename, cleanName);
      const serverItem = result?.file || result?.item;
      if (serverItem && getItemKey(serverItem)) {
        setItems((prev) => upsertItem(removeItemByKey(prev, itemKey), serverItem));
      } else {
        setItems((prev) => upsertItem(prev, { ...optimisticFile, _pending: null }));
      }
      loadFiles({ silentError: true });
      notifyActionTime("تم تغيير الاسم خلال", startedAt);
    } catch (err) {
      setItems(previousItems);
      setError(err?.response?.data?.message || err.message || "تعذر تغيير الاسم");
    }
  };

  const submitShareToUser = async (user) => {
    if (!shareModalFile) return;

    try {
      const existingShare = sharedUsersMap[String(user.tz || "").trim()];
      const isAlreadyShared = Boolean(existingShare);

      if (isAlreadyShared && existingShare.role === shareRole) {
        await unshareStorageEntry(shareModalFile, user.tz);
        toast.success("تم إلغاء المشاركة");
      } else {
        await shareStorageEntry(shareModalFile, user.tz, shareRole);
        toast.success(isAlreadyShared ? "تم تحديث صلاحية المشاركة" : "تمت مشاركة العنصر بنجاح");
      }

      await loadShareUsers();
      loadFiles({ silentError: true });
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر مشاركة العنصر");
    }
  };

  const downloadFile = async (file) => {
    closeContextMenu();
    const filename = file.path || file.filename || file.name;
    if (!filename || file.isDirectory) return;

    try {
      if (isSharedView) {
        await downloadSharedStorageFile(shareToken, filename);
      } else {
        await downloadStorageFile(filename);
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر تحميل الملف");
    }
  };

  const createFolder = async () => {
    if (isSharedView) return;
    closeContextMenu();

    const name = window.prompt("اسم المجلد الجديد");
    const cleanName = name?.trim();
    if (!cleanName) return;

    setError("");
    const optimisticFolder = createOptimisticFolder(cleanName, currentPath);
    const previousItems = items;
    setItems((prev) => upsertItem(prev, optimisticFolder));

    try {
      const result = await createStorageFolder({ path: currentPath, name: cleanName });
      const serverFolder = result?.folder || result?.item;
      if (serverFolder && getItemKey(serverFolder)) {
        setItems((prev) => upsertItem(removeItemByKey(prev, getItemKey(optimisticFolder)), serverFolder));
      } else {
        setItems((prev) => upsertItem(prev, { ...optimisticFolder, _pending: null }));
      }
      loadFiles({ silentError: true });
    } catch (err) {
      setItems(previousItems);
      setError(err?.response?.data?.message || err.message || "تعذر إنشاء المجلد");
    }
  };

  const openFolder = (file) => {
    closeContextMenu();
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

  const openFile = async (file) => {
    closeContextMenu();
    const filename = file.path || file.filename || file.name;
    if (!filename) return;

    try {
      if (isSharedView) {
        await openSharedStorageFile(shareToken, filename);
      } else {
        await openStorageFile(filename);
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر فتح الملف");
    }
  };

  return (
    <main
      className={`${styles.shell} ${dragActive ? styles.dragActive : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!isSharedView) setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      dir={dir}
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
            <h2>{isSharedView ? t("files.sharedTitle") : t("files.title")}</h2>
            {!isSharedView && storageStats && (
              <div className={styles.storageStats}>
                <div className={styles.storageStatsTop}>
                  <strong>{t("files.storage")}</strong>
                  <span>{storageUsagePercent}% {t("files.used")}</span>
                </div>
                <div className={styles.storageBar} aria-label={t("files.storage")}>
                  <span style={{ width: `${storageUsagePercent}%` }} />
                </div>
                <div className={styles.storageStatsGrid}>
                  <span>{t("files.used")}: {formatBytes(storageUsedBytes)}</span>
                  <span>{t("files.available")}: {formatBytes(storageFreeBytes)}</span>
                  <span>{t("files.total")}: {formatBytes(storageTotalBytes)}</span>
                </div>
              </div>
            )}
            {isSharedView && shareInfo?.name && (
              <p className={styles.sharedHint}>تمت مشاركة هذا العنصر مع: {shareInfo.name}</p>
            )}
          </div>

          {!isSharedView && (
            <div className={styles.actions}>
              <button className={styles.secondaryBtn} onClick={loadFiles} disabled={loading}>
                {t("files.refresh")}
              </button>
              <button className={styles.secondaryBtn} onClick={createFolder} disabled={loading}>
                {t("files.newFolder")}
              </button>
              <label className={styles.primaryBtn}>
                {uploading ? t("files.uploading") : t("files.uploadFile")}
                <input
                  ref={inputRef}
                  className={styles.fileInput}
                  type="file"
                  multiple
                  onChange={(event) => enqueueUploads(Array.from(event.target.files || []))}
                />
              </label>
            </div>
          )}
        </header>

        {!!uploadQueue.length && (
          <div className={styles.uploadProgress} role="status" aria-live="polite">
            <div className={styles.uploadProgressTop}>
              <strong>Uploads</strong>
              <span>{uploadQueue.filter((job) => activeUploadStatuses.has(job.status)).length} active</span>
            </div>
            <div className={styles.uploadList}>
              {uploadQueue.map((job) => {
                const statusText = job.status === "queued"
                  ? "Queued"
                  : job.status === "done"
                    ? "Done"
                    : job.status === "canceled"
                      ? "Canceled"
                      : job.status === "error"
                        ? "Error"
                        : job.phase?.startsWith("chunk-")
                          ? `Chunk ${job.phase.split("-")[1]} / ${job.phase.split("-")[2]}`
                          : job.status === "processing"
                            ? "Processing"
                            : job.status === "chunking"
                              ? "Chunk upload"
                              : "Uploading";

                return (
                  <div className={styles.uploadItem} key={job.id}>
                    <div className={styles.uploadItemTop}>
                      <span className={styles.uploadProgressName}>{job.fileName}</span>
                      <div className={styles.uploadProgressActions}>
                        <span>{job.percent || 0}%</span>
                        {activeUploadStatuses.has(job.status) && (
                          <button type="button" className={styles.cancelUploadBtn} onClick={() => cancelUploadJob(job.id)}>
                            إلغاء
                          </button>
                        )}
                      </div>
                    </div>
                    <div className={styles.uploadProgressBar} aria-label="تقدم رفع الملف">
                      <span style={{ width: `${job.percent || 0}%` }} />
                    </div>
                    <div className={styles.uploadProgressMeta}>
                      <span>{statusText}</span>
                      <span>{formatBytes(job.loaded || 0)} / {formatBytes(job.total || 0)}</span>
                    </div>
                    {job.error && <div className={styles.uploadError}>{job.error}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("files.search")}
          />
        </div>

        {dragActive && !isSharedView && <div className={styles.dropOverlay}>{t("files.dropHere")}</div>}
        {error && <div className={styles.error}>{error}</div>}
        {isRefreshing && <div className={styles.syncNotice}>{t("files.refreshing")}</div>}
        {isInitialLoading && <div className={styles.empty}>{t("files.loading")}</div>}

        {!isInitialLoading && !filteredItems.length && (
          <div className={styles.empty}>{t("files.noFiles")}</div>
        )}

        {!isInitialLoading && !!filteredItems.length && (
          <div className={styles.cardsGrid} data-label={t("files.foldersAndFiles")}>
            {explorerItems.map((file) => {
              const displayName = getDisplayName(file);
              const type = getType(file);
              const typeMeta = fileTypeMeta[type] || fileTypeMeta.other;
              const extension = file.isDirectory
                ? "DIR"
                : typeMeta.badge || getExtension(file.filename).toUpperCase() || "FILE";
              const canEditItem = !isSharedView && (!file.shared || ["write", "manage"].includes(file.sharedRole));
              const canManageItem = !isSharedView && (!file.shared || file.sharedRole === "manage");
              const pending = file._pending;
              const pendingText = pendingLabel[pending];
              const pendingPercent = Number(file._uploadPercent || 0);

              return (
                <article
                  key={getItemKey(file)}
                  className={`${styles.fileCard} ${file.isDirectory ? styles.folderCard : styles.documentCard} ${pending ? styles.pendingCard : ""}`}
                  onMouseDown={(event) => {
                    if (event.button === 2) {
                      openContextMenu(event, file);
                    }
                  }}
                  onContextMenu={(event) => openContextMenu(event, file)}
                >
                  <div className={styles.cardTop}>
                    <span className={styles.fileBadge}>{extension}</span>
                    {pendingText ? (
                      <span className={styles.operationPill}>{pendingText}</span>
                    ) : (
                    <button
                      type="button"
                      className={styles.menuBtn}
                      onClick={(event) => openContextMenuByButton(event, file)}
                      aria-label={t("files.options")}
                      title={t("files.options")}
                    >
                      ⋮
                    </button>
                    )}
                  </div>

                  <button
                    className={styles.cardTitle}
                    disabled={Boolean(pending)}
                    onClick={() => (file.isDirectory ? openFolder(file) : openFile(file))}
                  >
                    {file.isDirectory ? (
                      <span className={styles.folderIcon} />
                    ) : (
                      <span className={`${styles.documentIcon} ${styles[typeMeta.iconClass] || ""}`}>
                        <span className={styles.iconMark}>{typeMeta.mark}</span>
                      </span>
                    )}
                    {displayName}
                  </button>

                  {pending && (
                    <div className={styles.inlineProgress} aria-label="تقدم العملية">
                      <span style={{ width: `${pending === "uploading" || pending === "chunking" || pending === "processing" ? pendingPercent : 100}%` }} />
                    </div>
                  )}

                  {file.ownerName && (
                    <div className={styles.cardOwner}>{t("files.owner")}: {file.ownerName}</div>
                  )}

                  <div className={styles.cardMeta}>
                    <span>{file.isDirectory ? t("files.folder") : typeMeta.label}</span>
                    <span>{formatBytes(file.size)}</span>
                  </div>

                  <div className={styles.cardDate}>{formatDate(file.date, language)}</div>

                  <div className={styles.cardActions}>
                    <button disabled={Boolean(pending)} onClick={() => (file.isDirectory ? openFolder(file) : openFile(file))}>
                      {t("files.open")}
                    </button>
                    {!file.isDirectory && (
                      <button disabled={Boolean(pending)} onClick={() => downloadFile(file)}>
                        {t("files.download")}
                      </button>
                    )}

                    {(canEditItem || canManageItem) && (
                      <>
                        {canManageItem && <button disabled={Boolean(pending)} onClick={() => setShareModalFile(file)}>{t("files.share")}</button>}
                        {canEditItem && <button disabled={Boolean(pending)} onClick={() => handleRename(file)}>{t("files.rename")}</button>}
                        {canManageItem && <button disabled={Boolean(pending) || uploading} className={styles.deleteBtn} onClick={() => handleDelete(file)}>{t("files.delete")}</button>}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {shareModalFile && (
        <div className={styles.modalOverlay} onClick={() => setShareModalFile(null)}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{t("files.share")}</h3>
              <button className={styles.modalClose} onClick={() => setShareModalFile(null)}>×</button>
            </div>
            <p className={styles.modalHint}>
              اختر المستخدم المطلوب وحدد صلاحية المشاركة للعنصر: {getDisplayName(shareModalFile)}
            </p>
            <div className={styles.modalControls}>
              <input
                className={styles.searchInput}
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="ابحث بالاسم أو رقم الهوية..."
              />
              <select
                className={styles.roleSelect}
                value={shareRole}
                onChange={(event) => setShareRole(event.target.value)}
              >
                {shareRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className={styles.userList}>
              {usersLoading && <div className={styles.empty}>جار تحميل المستخدمين...</div>}
              {!usersLoading && !filteredUsers.length && (
                <div className={styles.empty}>لا يوجد مستخدمون مطابقون</div>
              )}
              {!usersLoading && filteredUsers.map((user) => (
                <button
                  key={user._id || user.tz}
                  className={styles.userOption}
                  onClick={() => submitShareToUser(user)}
                >
                  <span>
                    {[user.firstname, user.lastname].filter(Boolean).join(" ") || user.tz}
                    {sharedUsersMap[String(user.tz || "").trim()] ? " - مشترك" : ""}
                  </span>
                  <small>
                    {user.tz}
                    {sharedUsersMap[String(user.tz || "").trim()]
                      ? ` • ${getShareRoleLabel(sharedUsersMap[String(user.tz || "").trim()]?.role)} • اضغط للتحديث أو الإلغاء`
                      : " • اضغط للمشاركة"}
                  </small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className={styles.contextMenu}
          style={{
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() =>
              contextMenu.file.isDirectory
                ? openFolder(contextMenu.file)
                : openFile(contextMenu.file)
            }
          >
            {contextMenu.file.isDirectory ? t("files.open") : t("files.open")}
          </button>
          {!contextMenu.file.isDirectory && (
            <button
              className={styles.contextMenuItem}
              onClick={() => downloadFile(contextMenu.file)}
            >
              {t("files.download")}
            </button>
          )}

          {(contextMenu.canEditItem || contextMenu.canManageItem) && (
            <>
              {contextMenu.canManageItem && (
                <button
                  className={styles.contextMenuItem}
                  onClick={() => {
                    setShareModalFile(contextMenu.file);
                    closeContextMenu();
                  }}
                >
                  {t("files.share")}
                </button>
              )}
              {contextMenu.canEditItem && (
                <button
                  className={styles.contextMenuItem}
                  onClick={() => handleRename(contextMenu.file)}
                >
                  {t("files.rename")}
                </button>
              )}
              {contextMenu.canManageItem && (
                <button
                  className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
                  onClick={() => handleDelete(contextMenu.file)}
                >
                  {t("files.delete")}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
