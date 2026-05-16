import api, { API_BASE_URL } from "../api";

const trimSlashes = (value = "") => String(value).replace(/^\/+|\/+$/g, "");
const CHUNK_SIZE = 50 * 1024 * 1024;

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
  const { data } = await api.post("/storage/open-link", {
    path: safeName,
  });

  if (!data?.url) {
    throw new Error(data?.message || "تعذر إنشاء رابط فتح مؤقت");
  }

  return window.open(data.url, "_blank", "noopener,noreferrer");
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

export const uploadLargeStorageFile = async (file, path = "", name = "", options = {}) => {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploadId = createUploadId(file);
  const fileName = name?.trim() || file.name;

  console.info("[storage-upload] chunked:start", {
    uploadId,
    fileName,
    size: file.size,
    path,
    chunkSize: CHUNK_SIZE,
    totalChunks,
  });

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
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
        onUploadProgress: (event) => {
          const chunkLoaded = event.loaded || 0;
          const loaded = Math.min(file.size, start + chunkLoaded);
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

    console.info("[storage-upload] chunk:success", {
      uploadId,
      chunkIndex,
      totalChunks,
      bytes: chunk.size,
    });

    options.onUploadProgress?.({
      loaded: Math.min(file.size, end),
      total: file.size,
      percent: file.size ? Math.min(99, Math.round((end / file.size) * 100)) : 0,
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
    },
    { timeout: 30 * 60 * 1000 }
  );

  console.info("[storage-upload] merge:success", {
    uploadId,
    fileName: data?.fileName || data?.filename || fileName,
    path: data?.path || data?.relativePath,
    size: data?.size || data?.file?.size,
  });

  return data;
};

export const uploadStorageFileAuto = (file, path = "", name = "", options = {}) => {
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
  const { data } = await api.post(`/storage/share-link/${encodeURIComponent(token)}/open-link`, {
    path: trimSlashes(relativePath),
  });

  if (!data?.url) {
    throw new Error(data?.message || "تعذر إنشاء رابط فتح مؤقت");
  }

  return window.open(data.url, "_blank", "noopener,noreferrer");
};
