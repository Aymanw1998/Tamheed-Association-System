import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./FilesPage.module.css";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { API_BASE_URL } from "../../WebServer/services/api";
import {
  cancelStorageUpload,
  createStorageFolder,
  createStorageShareLink,
  deleteStorageFile,
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

export default function FilesPage() {
  const inputRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const contextMenuRef = useRef(null);
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
  const [sharedUsersMap, setSharedUsersMap] = useState({});
  const [contextMenu, setContextMenu] = useState(null);
  const [storageStats, setStorageStats] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [currentUploadSession, setCurrentUploadSession] = useState(null);

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

  const uploadFile = async (file) => {
    if (!file || isSharedView) return;

    const customName = window.prompt("اسم الملف", file.name);
    if (customName === null) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    setError("");
    setUploadProgress({
      fileName: customName.trim() || file.name,
      loaded: 0,
      total: file.size || 0,
      percent: 0,
      phase: "uploading",
    });
    const startedAt = performance.now();
    const pendingName = customName.trim() || file.name;
    const pendingUpload = {
      _tempKey: `upload-${Date.now()}-${file.name}`,
      name: pendingName,
      displayName: pendingName,
      filename: joinStoragePath(currentPath, pendingName),
      path: joinStoragePath(currentPath, pendingName),
      size: file.size || 0,
      type: file.type || "",
      date: new Date().toISOString(),
      isDirectory: false,
      _pending: "uploading",
      _uploadPercent: 0,
    };
    const pendingKey = getItemKey(pendingUpload);
    setItems((prev) => upsertItem(prev, pendingUpload));

    try {
      const uploadResult = await uploadStorageFileAuto(file, currentPath, customName.trim(), {
        onFallbackToChunks: () => {
          setItems((prev) => upsertItem(prev, { ...pendingUpload, _pending: "chunking", _uploadPercent: 0 }));
          setUploadProgress({
            fileName: customName.trim() || file.name,
            loaded: 0,
            total: file.size || 0,
            percent: 0,
            phase: "retrying-chunks",
          });
        },
        onUploadSession: (session) => {
          setCurrentUploadSession(session);
        },
        onUploadProgress: (event) => {
          const total = event.total || file.size || 0;
          const loaded = event.loaded || 0;
          const percent = event.percent ?? (total ? Math.min(99, Math.round((loaded / total) * 100)) : 0);

          setUploadProgress({
            fileName: customName.trim() || file.name,
            loaded,
            total,
            percent,
            phase: percent >= 99 ? "processing" : event.totalChunks ? `chunk-${event.chunkIndex + 1}-${event.totalChunks}` : "uploading",
          });
          setItems((prev) => upsertItem(prev, {
            ...pendingUpload,
            _pending: percent >= 99 ? "processing" : event.totalChunks ? "chunking" : "uploading",
            _uploadPercent: percent,
          }));
        },
      });
      const uploadedItem = normalizeUploadResultItem(uploadResult, {
        name: customName.trim() || file.name,
        path: currentPath,
        size: file.size || 0,
        type: file.type || "",
      });

      if (getItemKey(uploadedItem)) {
        setItems((prev) => upsertItem(removeItemByKey(prev, pendingKey), uploadedItem));
      }

      setUploadProgress((prev) => prev ? { ...prev, loaded: prev.total, percent: 100, phase: "done" } : prev);
      setCurrentUploadSession(null);
      setError("");
      loadFiles({ silentError: true });
      notifyActionTime("تم رفع الملف خلال", startedAt);
    } catch (err) {
      setItems((prev) => removeItemByKey(prev, pendingKey));
      setError(err?.response?.data?.message || err.message || "تعذر رفع الملف");
    } finally {
      setUploading(false);
      setCurrentUploadSession(null);
      window.setTimeout(() => setUploadProgress(null), 900);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    setContextMenu(null);
    if (isSharedView) return;
    uploadFile(event.dataTransfer.files?.[0]);
  };

  const cancelCurrentUpload = async () => {
    const uploadId = currentUploadSession?.uploadId;
    if (!uploadId) return;

    try {
      await cancelStorageUpload(uploadId);
      setUploading(false);
      setCurrentUploadSession(null);
      setUploadProgress(null);
      setItems((prev) => prev.filter((item) => !item._tempKey));
      toast.success("تم إلغاء الرفع");
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر إلغاء الرفع");
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  const getContextMenuPosition = (x = 0, y = 0, canManageItem = false) => {
    const menuWidth = 220;
    const menuHeight = canManageItem ? 220 : 72;
    const safeX = Math.max(12, Math.min(x, window.innerWidth - menuWidth - 12));
    const safeY = Math.max(12, Math.min(y, window.innerHeight - menuHeight - 12));
    return { x: safeX, y: safeY };
  };

  const openContextMenu = (event, file) => {
    event.preventDefault();
    event.stopPropagation();
    const canManageItem = !isSharedView && !file.shared;
    const position = getContextMenuPosition(event.clientX, event.clientY, canManageItem);

    setContextMenu({
      x: position.x,
      y: position.y,
      file,
      canManageItem,
    });
  };

  const openContextMenuByButton = (event, file) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const canManageItem = !isSharedView && !file.shared;
    const position = getContextMenuPosition(rect.left, rect.bottom + 6, canManageItem);

    setContextMenu({
      x: position.x,
      y: position.y,
      file,
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

  const handleCreateShareLink = async (file) => {
    if (isSharedView) return;
    closeContextMenu();

    try {
      const result = await createStorageShareLink(file);
      if (!result?.url) {
        throw new Error(result?.message || "تعذر إنشاء رابط المشاركة");
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.url);
        toast.success("تم نسخ رابط المشاركة");
      } else {
        window.prompt("انسخ رابط المشاركة", result.url);
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر إنشاء رابط المشاركة");
    }
  };

  const submitShareToUser = async (user) => {
    if (!shareModalFile) return;

    try {
      const isAlreadyShared = Boolean(sharedUsersMap[String(user.tz || "").trim()]);

      if (isAlreadyShared) {
        await unshareStorageEntry(shareModalFile, user.tz);
        toast.success("تم إلغاء المشاركة");
      } else {
        await shareStorageEntry(shareModalFile, user.tz, "read");
        toast.success("تمت مشاركة العنصر بنجاح");
      }

      await loadShareUsers();
      loadFiles({ silentError: true });
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "تعذر مشاركة العنصر");
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
            <h2>{isSharedView ? "عرض مشترك" : "ملفات"}</h2>
            {!isSharedView && storageStats && (
              <div className={styles.storageStats}>
                <div className={styles.storageStatsTop}>
                  <strong>مساحة التخزين</strong>
                  <span>{storageUsagePercent}% قيد الاستخدام</span>
                </div>
                <div className={styles.storageBar} aria-label="مساحة التخزين قيد الاستخدام">
                  <span style={{ width: `${storageUsagePercent}%` }} />
                </div>
                <div className={styles.storageStatsGrid}>
                  <span>قيد الاستخدام: {formatBytes(storageUsedBytes)}</span>
                  <span>متاح: {formatBytes(storageFreeBytes)}</span>
                  <span>إجمالي المساحة: {formatBytes(storageTotalBytes)}</span>
                </div>
              </div>
            )}
            {isSharedView && shareInfo?.name && (
              <p className={styles.sharedHint}>تمت مشاركة هذا العنصر مع: {shareInfo.name}</p>
            )}
          </div>

          {!isSharedView && (
            <div className={styles.actions}>
              <button className={styles.secondaryBtn} onClick={loadFiles} disabled={loading || uploading}>
                تحديث
              </button>
              <button className={styles.secondaryBtn} onClick={createFolder} disabled={loading || uploading}>
                مجلد جديد
              </button>
              <label className={styles.primaryBtn}>
                {uploading ? "جار الرفع..." : "رفع ملف"}
                <input
                  ref={inputRef}
                  className={styles.fileInput}
                  type="file"
                  onChange={(event) => uploadFile(event.target.files?.[0])}
                  disabled={uploading}
                />
              </label>
            </div>
          )}
        </header>

        {uploadProgress && (
          <div className={styles.uploadProgress} role="status" aria-live="polite">
            <div className={styles.uploadProgressTop}>
              <strong>
                {uploadProgress.phase === "done"
                  ? "اكتمل الرفع"
                  : uploadProgress.phase === "processing"
                    ? "جار تجميع الملف..."
                    : uploadProgress.phase === "retrying-chunks"
                      ? "فشل الرفع الكامل، جار التحويل إلى أجزاء..."
                    : uploadProgress.phase?.startsWith("chunk-")
                      ? `جار رفع الجزء ${uploadProgress.phase.split("-")[1]} من ${uploadProgress.phase.split("-")[2]}`
                      : "جار رفع الملف..."}
              </strong>
              <span>{uploadProgress.percent}%</span>
            </div>
            <div className={styles.uploadProgressName}>{uploadProgress.fileName}</div>
            <div className={styles.uploadProgressBar} aria-label="تقدم رفع الملف">
              <span style={{ width: `${uploadProgress.percent}%` }} />
            </div>
            <div className={styles.uploadProgressMeta}>
              <span>{formatBytes(uploadProgress.loaded)} / {formatBytes(uploadProgress.total)}</span>
              {currentUploadSession?.uploadId && (
                <button type="button" className={styles.cancelUploadBtn} onClick={cancelCurrentUpload}>
                  إلغاء الرفع
                </button>
              )}
            </div>
          </div>
        )}

        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث في الملفات..."
          />
        </div>

        {dragActive && !isSharedView && <div className={styles.dropOverlay}>اسحب الملف وأفلته هنا</div>}
        {error && <div className={styles.error}>{error}</div>}
        {isRefreshing && <div className={styles.syncNotice}>??? ????? ???????...</div>}
        {isInitialLoading && <div className={styles.empty}>??? ????? ???????...</div>}

        {!isInitialLoading && !filteredItems.length && (
          <div className={styles.empty}>لا توجد ملفات</div>
        )}

        {!isInitialLoading && !!filteredItems.length && (
          <div className={styles.cardsGrid}>
            {explorerItems.map((file) => {
              const displayName = getDisplayName(file);
              const type = getType(file);
              const typeMeta = fileTypeMeta[type] || fileTypeMeta.other;
              const extension = file.isDirectory
                ? "DIR"
                : typeMeta.badge || getExtension(file.filename).toUpperCase() || "FILE";
              const canManageItem = !isSharedView && !file.shared;
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
                      aria-label="خيارات الملف"
                      title="خيارات الملف"
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
                    <div className={styles.cardOwner}>المالك: {file.ownerName}</div>
                  )}

                  <div className={styles.cardMeta}>
                    <span>{file.isDirectory ? "مجلد" : typeMeta.label}</span>
                    <span>{formatBytes(file.size)}</span>
                  </div>

                  <div className={styles.cardDate}>{formatDate(file.date)}</div>

                  <div className={styles.cardActions}>
                    <button disabled={Boolean(pending)} onClick={() => (file.isDirectory ? openFolder(file) : openFile(file))}>
                      {file.isDirectory ? "فتح" : "فتح"}
                    </button>

                    {canManageItem && (
                      <>
                        <button disabled={Boolean(pending)} onClick={() => setShareModalFile(file)}>مشاركة</button>
                        <button disabled={Boolean(pending)} onClick={() => handleCreateShareLink(file)}>رابط</button>
                        <button disabled={Boolean(pending)} onClick={() => handleRename(file)}>إعادة تسمية</button>
                        <button disabled={Boolean(pending) || uploading} className={styles.deleteBtn} onClick={() => handleDelete(file)}>حذف</button>
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
              <h3>مشاركة العنصر</h3>
              <button className={styles.modalClose} onClick={() => setShareModalFile(null)}>×</button>
            </div>
            <p className={styles.modalHint}>
              اختر المستخدم المطلوب. المشاركة للمستخدمين هي بصلاحية قراءة فقط للعنصر: {getDisplayName(shareModalFile)}
            </p>
            <div className={styles.modalControls}>
              <input
                className={styles.searchInput}
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="ابحث بالاسم أو رقم الهوية..."
              />
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
                    {sharedUsersMap[String(user.tz || "").trim()] ? " • اضغط لإلغاء المشاركة" : " • اضغط للمشاركة"}
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
            {contextMenu.file.isDirectory ? "فتح المجلد" : "فتح الملف"}
          </button>

          {contextMenu.canManageItem && (
            <>
              <button
                className={styles.contextMenuItem}
                onClick={() => {
                  setShareModalFile(contextMenu.file);
                  closeContextMenu();
                }}
              >
                مشاركة
              </button>
              <button
                className={styles.contextMenuItem}
                onClick={() => handleCreateShareLink(contextMenu.file)}
              >
                رابط مشاركة
              </button>
              <button
                className={styles.contextMenuItem}
                onClick={() => handleRename(contextMenu.file)}
              >
                تغيير الاسم
              </button>
              <button
                className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
                onClick={() => handleDelete(contextMenu.file)}
              >
                حذف
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}
