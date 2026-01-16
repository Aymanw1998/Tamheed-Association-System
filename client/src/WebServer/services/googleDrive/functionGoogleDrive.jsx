import api from "../api"; // אצלך כבר קיים

// LIST
export const listDrive = async () => {
  const res = await api.get("/drive/list");
  return res.data; // {ok, data}
};

// UPLOAD (FormData)
export const uploadDrive = async (file) => {
  const fd = new FormData();
  fd.append("file", file);
  console.log("uploadDrive file:", file);
  const res = await api.post("/drive/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

// DELETE
export const deleteDriveItem = async (fileId) => {
  const res = await api.delete(`/drive/${fileId}`);
  return res.data;
};

// CREATE FOLDER
export const createDriveFolder = async (name) => {
  const res = await api.post("/drive/folder", { name });
  return res.data;
};

// RENAME
export const renameDriveItem = async (fileId, newName) => {
  const res = await api.patch(`/drive/${fileId}/rename`, { newName });
  return res.data;
};

// DOWNLOAD (פותח הורדה בדפדפן)
export const downloadDrive = (fileId) => {
  // זה יוריד ישירות מהשרת (stream)
  window.open(`${api.defaults.baseURL}/drive/download/${fileId}`, "_blank");
};
