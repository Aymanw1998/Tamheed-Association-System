const fs = require("fs");
const mime = require("mime-types");
const drive = require("../config/google-drive");

const ROOT_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

// רשימה (קבצים + תיקיות) בתוך תיקייה
async function listInRoot() {
  const res = await drive.files.list({
    q: `'${ROOT_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id,name,mimeType,modifiedTime,size)",
    orderBy: "folder,name",
  });
  return res.data.files;
}

// העלאה לתיקייה
async function uploadToRoot(localPath, originalName) {
    try{
        const contentType = mime.lookup(originalName) || "application/octet-stream";
        const data = {
            requestBody: { name: originalName, parents: [ROOT_FOLDER_ID] },
            media: { mimeType: contentType, body: fs.createReadStream(localPath) },
            fields: "id,name,mimeType,modifiedTime,size",
        }
        console.log("data:", data);
        const res = await drive.files.create(data);
        console.log("uploadToRoot:", { localPath, originalName, contentType });
        return res.data;
    } catch (e){
        console.error("uploadToRoot error:", e.message);
        return null;
    }
}

// הורדה (stream)
async function downloadFileStream(fileId) {
  const meta = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,size",
  });

  const streamRes = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );

  return { meta: meta.data, stream: streamRes.data };
}

// מחיקה
async function deleteFile(fileId) {
  await drive.files.delete({ fileId });
  return true;
}

// יצירת תיקייה בתוך ROOT
async function createFolder(name) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [ROOT_FOLDER_ID],
    },
    fields: "id,name,mimeType,modifiedTime",
  });
  return res.data;
}

// שינוי שם (rename)
async function rename(fileId, newName) {
  const res = await drive.files.update({
    fileId,
    requestBody: { name: newName },
    fields: "id,name,mimeType,modifiedTime",
  });
  return res.data;
}

module.exports = {
  listInRoot,
  uploadToRoot,
  downloadFileStream,
  deleteFile,
  createFolder,
  rename,
};
