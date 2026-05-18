import api, { API_BASE_URL } from "../api";

const trimSlashes = (value = "") => String(value).replace(/^\/+|\/+$/g, "");
const CHUNK_SIZE = 50 * 1024 * 1024;
const DIRECT_CHUNK_THRESHOLD = 90 * 1024 * 1024;
const UPLOAD_SESSION_PREFIX = "tamheed.storageUpload.";
let fileWindowCounter = 0;

const openPendingFileWindow = () => {
  const targetName = `tamheed-file-${Date.now()}-${fileWindowCounter += 1}`;
  const fileWindow = window.open("about:blank", targetName);

  if (!fileWindow) {
    return { fileWindow: null, targetName };
  }

  try {
    fileWindow.name = targetName;
    fileWindow.opener = null;
    fileWindow.document.open();
    fileWindow.document.write("<!doctype html><title>Opening file...</title>");
    fileWindow.document.close();
  } catch {
    // Some browsers restrict writes to new tabs. The window handle is still usable.
  }

  return { fileWindow, targetName };
};

const sendUrlToFileWindow = (fileWindow, targetName, url) => {
  if (fileWindow && !fileWindow.closed) {
    fileWindow.location.replace(url);
    return fileWindow;
  }

  const link = document.createElement("a");
  link.href = url;
  link.target = targetName || "_blank";
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return null;
};

const shouldRetryWithChunks = (error) => {
  const status = error?.response?.status;
  const message = String(
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    ""
  ).toLowerCase();

  return (
    status === 413 ||
    status === 524 ||
    status === 408 ||
    status === 504 ||
    message.includes("payload too large") ||
    message.includes("request entity too large") ||
    message.includes("cloudflare") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("file too large") ||
    message.includes("الملف كبير")
  );
};

export const getStorageFileUrl = (filename, options = {}) => {
  const safeName = trimSlashes(filename);
  const params = new URLSearchParams();
  params.set("path", safeName);
  if (options.download) {
    params.set("download", "1");
  }

  return `${API_BASE_URL}/storage/open?${params.toString()}`;
};

export const getStorageDownloadUrl = (filename) => {
  const safeName = trimSlashes(filename);
  const params = new URLSearchParams();
  params.set("path", safeName);
  params.set("download", "1");
  return `${API_BASE_URL}/storage/download?${params.toString()}`;
};

export const openStorageFile = async (filename) => {
  const safeName = trimSlashes(filename);
  const { fileWindow, targetName } = openPendingFileWindow();
  const { data } = await api.post("/storage/open-link", {
    path: safeName,
  });

  if (!data?.url) {
    fileWindow?.close?.();
    throw new Error(data?.message || "تعذر إنشاء رابط فتح مؤقت");
  }

  return sendUrlToFileWindow(fileWindow, targetName, data.url);
};

const normalizeFile = (file) => {
  if (typeof file === "string") {
    return { name: file, filename: file };
  }

  const name =
    file?.name ||
    file?.filename ||
    file?.originalName ||
    file?.key ||
    "";

  return {
    ...file,
    name,
    displayName: file?.displayName || name,
    filename: file?.filename || file?.relativePath || name,
    path: file?.path || file?.relativePath || file?.filename || name,
    ownerName: file?.ownerName || "",
    size: file?.size ?? file?.bytes ?? null,
    date: file?.date || file?.modifiedAt || file?.createdAt || file?.updatedAt || file?.mtime || null,
    type: file?.type || file?.mimeType || file?.ext || "",
    isDirectory: Boolean(file?.isDirectory),
    url: file?.url || file?.secure_url || null,
  };
};

export const getStorageEntries = async (path = "") => {
  const { data } = await api.get("/storage/list", {
    params: { path },
    timeout: 60 * 1000,
  });
  const items = data?.items || [
    ...(data?.folders || []),
    ...(data?.files || []),
  ];

  return {
    ...data,
    items: items.map(normalizeFile).filter((file) => file.name),
    folders: (data?.folders || []).map(normalizeFile).filter((file) => file.name),
    files: (data?.files || []).map(normalizeFile).filter((file) => file.name),
  };
};

export const getStorageFiles = async (path = "") => {
  const data = await getStorageEntries(path);
  return data.files;
};

export const getStorageStats = async (path = "") => {
  const { data } = await api.get("/storage/stats", {
    params: { path },
    timeout: 60 * 1000,
  });
  return data;
};

export const createStorageFolder = async ({ path = "", name }) => {
  const { data } = await api.post("/storage/folder", { path, name });
  return data;
};

export const uploadStorageFile = async (file, path = "", name = "", options = {}) => {
  console.info("[storage-upload] normal:start", {
    fileName: name || file?.name,
    size: file?.size,
    path,
  });
  const formData = new FormData();
  formData.append("file", file);
  formData.append("path", path);
  if (name?.trim()) {
    formData.append("name", name.trim());
  }

  try {
    const { data } = await api.post("/storage/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 30 * 60 * 1000,
      signal: options.signal,
      onUploadProgress: options.onUploadProgress,
    });

    console.info("[storage-upload] normal:success", {
      fileName: data?.filename || data?.file?.name || name || file?.name,
      size: data?.size || data?.file?.size,
      path: data?.path || data?.relativePath,
    });

    return data;
  } catch (error) {
    console.error("[storage-upload] normal:error", {
      status: error?.response?.status,
      message: error?.response?.data?.message || error?.response?.data?.error || error?.message,
      fileName: name || file?.name,
      size: file?.size,
      path,
    });
    throw error;
  }
};

const createUploadId = (file) => {
  const randomId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}-${Date.now()}`;

  return `${Date.now()}-${randomId}-${file.name}`.replace(/[^a-zA-Z0-9._-]/g, "_");
};

const getUploadSessionKey = (file, path = "") =>
  `${UPLOAD_SESSION_PREFIX}${trimSlashes(path)}:${file.name}:${file.size}:${file.lastModified || 0}`;

const readStoredUploadSession = (file, path = "") => {
  try {
    const raw = localStorage.getItem(getUploadSessionKey(file, path));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeStoredUploadSession = (file, path = "", session = {}) => {
  localStorage.setItem(getUploadSessionKey(file, path), JSON.stringify({
    ...session,
    fileName: session.fileName || file.name,
    fileSize: file.size,
    lastModified: file.lastModified || 0,
    path: path || "",
    updatedAt: new Date().toISOString(),
  }));
};

const removeStoredUploadSession = (file, path = "") => {
  localStorage.removeItem(getUploadSessionKey(file, path));
};

const removeStoredUploadSessionById = (uploadId = "") => {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(UPLOAD_SESSION_PREFIX)) keys.push(key);
  }

  keys.forEach((key) => {
      try {
        const session = JSON.parse(localStorage.getItem(key) || "{}");
        if (session.uploadId === uploadId) {
          localStorage.removeItem(key);
        }
      } catch {
        localStorage.removeItem(key);
      }
    });
};

export const getStorageUploadStatus = async (uploadId, options = {}) => {
  const { data } = await api.get("/storage/upload-status", {
    params: { uploadId },
    timeout: 60 * 1000,
    signal: options.signal,
  });
  return data;
};

export const cancelStorageUpload = async (uploadId) => {
  const { data } = await api.post("/storage/cancel-upload", { uploadId }, { timeout: 60 * 1000 });
  removeStoredUploadSessionById(uploadId);
  return data;
};

export const uploadLargeStorageFile = async (file, path = "", name = "", options = {}) => {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const fileName = name?.trim() || file.name;
  const storedSession = readStoredUploadSession(file, path);
  const uploadId = storedSession?.uploadId || createUploadId(file);
  const session = {
    ...(storedSession || {}),
    uploadId,
    fileName,
    totalChunks,
    chunkSize: CHUNK_SIZE,
    path: path || "",
    status: "uploading",
  };

  writeStoredUploadSession(file, path, session);
  options.onUploadSession?.(session);

  console.info("[storage-upload] chunked:start", {
    uploadId,
    fileName,
    size: file.size,
    path,
    chunkSize: CHUNK_SIZE,
    totalChunks,
    resumed: Boolean(storedSession?.uploadId),
  });

  let missingChunks = Array.from({ length: totalChunks }, (_, index) => index);
  let receivedChunks = [];

  try {
    const status = await getStorageUploadStatus(uploadId, options);
    if (status?.status === "completed") {
      removeStoredUploadSession(file, path);
    } else if (Array.isArray(status?.missingChunks) && status.totalChunks === totalChunks) {
      missingChunks = status.missingChunks.map(Number).filter((index) => Number.isInteger(index));
      receivedChunks = (status.receivedChunks || []).map(Number).filter((index) => Number.isInteger(index));
    }
    console.info("[storage-upload] status:success", {
      uploadId,
      receivedChunks: receivedChunks.length,
      missingChunks: missingChunks.length,
      status: status?.status,
    });
  } catch (error) {
    console.warn("[storage-upload] status:error", {
      uploadId,
      status: error?.response?.status,
      message: error?.response?.data?.message || error?.message,
    });
  }

  if (missingChunks.length === 0) {
    options.onUploadProgress?.({
      loaded: file.size,
      total: file.size,
      percent: 99,
      chunkIndex: totalChunks - 1,
      totalChunks,
    });
  }

  for (const chunkIndex of missingChunks) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunk = file.slice(start, end);
    const formData = new FormData();

    formData.append("chunk", chunk);
    formData.append("uploadId", uploadId);
    formData.append("fileName", fileName);
    formData.append("chunkIndex", String(chunkIndex));
    formData.append("totalChunks", String(totalChunks));
    formData.append("path", path || "");
    formData.append("chunkSize", String(CHUNK_SIZE));

    console.info("[storage-upload] chunk:start", {
      uploadId,
      chunkIndex,
      totalChunks,
      start,
      end,
      bytes: chunk.size,
    });

    try {
      await api.post("/storage/upload-chunk", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30 * 60 * 1000,
        signal: options.signal,
        onUploadProgress: (event) => {
          const chunkLoaded = event.loaded || 0;
          const loaded = Math.min(file.size, (receivedChunks.length * CHUNK_SIZE) + chunkLoaded);
          const percent = file.size ? Math.min(99, Math.round((loaded / file.size) * 100)) : 0;

          options.onUploadProgress?.({
            loaded,
            total: file.size,
            percent,
            chunkIndex,
            totalChunks,
          });
        },
      });
    } catch (error) {
      console.error("[storage-upload] chunk:error", {
        uploadId,
        chunkIndex,
        totalChunks,
        status: error?.response?.status,
        message: error?.response?.data?.message || error?.response?.data?.error || error?.message,
      });
      throw error;
    }
    receivedChunks.push(chunkIndex);
    writeStoredUploadSession(file, path, {
      ...session,
      receivedChunks,
      status: "uploading",
    });

    console.info("[storage-upload] chunk:success", {
      uploadId,
      chunkIndex,
      totalChunks,
      bytes: chunk.size,
    });

    options.onUploadProgress?.({
      loaded: Math.min(file.size, receivedChunks.length * CHUNK_SIZE),
      total: file.size,
      percent: file.size ? Math.min(99, Math.round(((receivedChunks.length * CHUNK_SIZE) / file.size) * 100)) : 0,
      chunkIndex,
      totalChunks,
    });
  }

  console.info("[storage-upload] merge:start", { uploadId, fileName, totalChunks, path });

  const { data } = await api.post(
    "/storage/merge-chunks",
    {
      uploadId,
      fileName,
      totalChunks,
      path: path || "",
      mimeType: file.type || "",
      size: file.size,
      chunkSize: CHUNK_SIZE,
    },
    { timeout: 30 * 60 * 1000, signal: options.signal }
  );

  console.info("[storage-upload] merge:success", {
    uploadId,
    fileName: data?.fileName || data?.filename || fileName,
    path: data?.path || data?.relativePath,
    size: data?.size || data?.file?.size,
  });

  removeStoredUploadSession(file, path);
  return data;
};

export const uploadStorageFileAuto = (file, path = "", name = "", options = {}) => {
  if (file?.size > DIRECT_CHUNK_THRESHOLD) {
    console.info("[storage-upload] auto:large-file-direct-chunked", {
      fileName: name || file?.name,
      size: file?.size,
      threshold: DIRECT_CHUNK_THRESHOLD,
    });
    options.onFallbackToChunks?.({ reason: "large-file-direct-chunked" });
    return uploadLargeStorageFile(file, path, name, options);
  }

  return uploadStorageFile(file, path, name, options).catch((error) => {
    if (!shouldRetryWithChunks(error)) {
      throw error;
    }

    console.warn("[storage-upload] fallback:chunked", {
      status: error?.response?.status,
      message: error?.response?.data?.message || error?.response?.data?.error || error?.message,
      fileName: name || file?.name,
      size: file?.size,
    });
    options.onFallbackToChunks?.(error);
    return uploadLargeStorageFile(file, path, name, options);
  });
};

export const uploadStorageFileChunked = uploadLargeStorageFile;

export const isChunkFallbackError = shouldRetryWithChunks;

export const deleteStorageFile = async (filename) => {
  const { data } = await api.delete("/storage/delete", {
    data: { relativePath: trimSlashes(filename) },
  });
  return data;
};

export const renameStorageFile = async (filename, newName) => {
  const { data } = await api.patch("/storage/rename", {
    relativePath: trimSlashes(filename),
    newName,
  });

  return data;
};

export const shareStorageEntry = async (file, targetTz, role = "read") => {
  const { data } = await api.post("/storage/share", {
    relativePath: trimSlashes(file?.path || file?.filename || file?.name || ""),
    targetTz: String(targetTz || "").trim(),
    role,
    name: file?.name || file?.filename || "",
    isDirectory: Boolean(file?.isDirectory),
    size: file?.size ?? null,
    mimeType: file?.mimeType || file?.type || "",
    url: file?.url || null,
  });

  return data;
};

export const getStorageShareStatus = async (file) => {
  const { data } = await api.get("/storage/share-status", {
    params: {
      relativePath: trimSlashes(file?.path || file?.filename || file?.name || ""),
    },
  });

  return data;
};

export const unshareStorageEntry = async (file, targetTz) => {
  const { data } = await api.post("/storage/unshare", {
    relativePath: trimSlashes(file?.path || file?.filename || file?.name || ""),
    targetTz: String(targetTz || "").trim(),
  });

  return data;
};

export const createStorageShareLink = async (file) => {
  const { data } = await api.post("/storage/share-link", {
    relativePath: trimSlashes(file?.path || file?.filename || file?.name || ""),
    name: file?.name || file?.filename || "",
    isDirectory: Boolean(file?.isDirectory),
    size: file?.size ?? null,
    mimeType: file?.mimeType || file?.type || "",
    url: file?.url || null,
  });

  return data;
};

export const getStorageShareLinkInfo = async (token) => {
  const { data } = await api.get(`/storage/share-link/${encodeURIComponent(token)}`);
  return data;
};

export const getStorageSharedEntries = async (token, path = "") => {
  const { data } = await api.get(`/storage/share-link/${encodeURIComponent(token)}/items`, {
    params: { path },
  });

  const items = data?.items || [];
  return {
    ...data,
    items: items.map(normalizeFile).filter((file) => file.name || file.filename),
    folders: (data?.folders || []).map(normalizeFile).filter((file) => file.name || file.filename),
    files: (data?.files || []).map(normalizeFile).filter((file) => file.name || file.filename),
  };
};

export const openSharedStorageFile = async (token, relativePath = "") => {
  const { fileWindow, targetName } = openPendingFileWindow();
  const { data } = await api.post(`/storage/share-link/${encodeURIComponent(token)}/open-link`, {
    path: trimSlashes(relativePath),
  });

  if (!data?.url) {
    fileWindow?.close?.();
    throw new Error(data?.message || "تعذر إنشاء رابط فتح مؤقت");
  }

  return sendUrlToFileWindow(fileWindow, targetName, data.url);
};
