import api, { API_BASE_URL } from "../api";

const trimSlashes = (value = "") => String(value).replace(/^\/+|\/+$/g, "");

export const getStorageFileUrl = (filename) => {
  if (/^https?:\/\//i.test(String(filename))) {
    return filename;
  }

  const safeName = trimSlashes(filename)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${API_BASE_URL}/storage/${safeName}`;
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
    filename: file?.filename || file?.relativePath || name,
    path: file?.path || file?.relativePath || file?.filename || name,
    size: file?.size ?? file?.bytes ?? null,
    date: file?.date || file?.modifiedAt || file?.createdAt || file?.updatedAt || file?.mtime || null,
    type: file?.type || file?.mimeType || file?.ext || "",
    isDirectory: Boolean(file?.isDirectory),
    url: file?.url || file?.secure_url || null,
  };
};

export const getStorageEntries = async (path = "") => {
  const { data } = await api.get("/storage/list", { params: { path } });
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

export const createStorageFolder = async ({ path = "", name }) => {
  const { data } = await api.post("/storage/folder", { path, name });
  return data;
};

export const uploadStorageFile = async (file, path = "", name = "") => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("path", path);
  if (name?.trim()) {
    formData.append("name", name.trim());
  }

  const { data } = await api.post("/storage/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return data;
};

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
