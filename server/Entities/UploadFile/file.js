const path = require("path");

function safeSegment(value = "") {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function safeName(name = "") {
  return String(name)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function getExt(file) {
  const fromOriginal = path.extname(file.originalname || "");
  if (fromOriginal) return fromOriginal.toLowerCase();

  const mime = file.mimetype || "";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "application/pdf") return ".pdf";
  return "";
}

function buildRelativeDir(dbName, collection, folder = "") {
  const safeDbName = safeSegment(dbName || "default_db");
  const safeCollection = safeSegment(collection || "default_collection");
  const safeFolder = safeSegment(folder || "");

  if (safeFolder) {
    return path.join(safeDbName, safeCollection, safeFolder);
  }

  return path.join(safeDbName, safeCollection);
}

const googleDrive = require("../../services/googleDrive.service");

const buildPhotoName = (tz = "", file = {}) => {
  const ext = path.extname(file.originalname || "") || "";
  return `${tz || "person"}${ext}`;
};

async function handleUpload(file, dbName, collection, tz = "") {
  try {
    if (!file || !file.buffer) {
      throw new Error("Missing file buffer");
    }

    if (!dbName) {
      throw new Error("dbName is required");
    }

    if (!collection) {
      throw new Error("collection is required");
    }
    const customFileName = buildPhotoName(tz, file);
    const uploadFileName = safeName(customFileName || path.basename(file.originalname || "file")) || "file";
    const uploadExt = path.extname(uploadFileName) || getExt(file);
    const finalFileName = uploadExt && !uploadFileName.endsWith(uploadExt)
      ? `${uploadFileName}${uploadExt}`
      : uploadFileName;

    const uploaded = await googleDrive.uploadFile({
      buffer: file.buffer,
      name: finalFileName,
      mimeType: file.mimetype,
      folderPath: buildRelativeDir(dbName, collection),
    });

    // secure_url naming kept for compatibility with existing callers
    // (User.controller.js / Student.controller.js read `.secure_url`).
    return { secure_url: uploaded.viewUrl, public_id: uploaded.id };
  } catch (err) {
    console.error("Google Drive upload error:", err.message || err);
    return null;
  }
}
async function handleDelete(filePathOrUrl) {
  try {
    if (!filePathOrUrl) return null;
    return await googleDrive.deleteFile(filePathOrUrl);
  } catch (err) {
    console.error("Google Drive delete error:", err.message || err);
    return null;
  }
}

async function handleDeleteByUrl(url) {
    try {
        return await handleDelete(url);
    } catch (err) {
        console.error("Delete by URL error:", err);
        return null;
    }
}

module.exports = {
    handleUpload,
    handleDelete,
    handleDeleteByUrl,
};

// OLD CODE - DO NOT SUGGEST
// const cloudinary = require("cloudinary").v2;
// cloudinary.config({
//     cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//     api_key: process.env.CLOUDINARY_API_KEY,
//     api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// const handleUpload = async (file, folder) => {
//     let res = null;
//     try{
//         console.log("uploading file to cloudinary...", file);
//         console.log("folder:", folder);
//         const b64 = Buffer.from(file.buffer).toString("base64");
//         const dataUri = `data:${file.mimetype};base64,${b64}`;

//         res = await cloudinary.uploader.upload(dataUri, {resource_type: "auto", folder: "tamheed/" + folder });
//         console.log("add file", res )
//         return res;
//     }
//     catch(err) {
//         console.log(err)
//         return null;
//     }
// }

// const handleDelete = async (public_id) => {
    
//     try{
//         const id = public_id;
//         console.log("deleting file from cloudinary...", id);
//         const res = await cloudinary.uploader.destroy(id,{resource_type: "image"},(result)=>console.log(result));
//         console.log("delete file", res )
//         return res;
//     }
//     catch(err) {
//         console.log(err)
//         return null;
//     }
// }

// const handleDeleteByUrl = async (url) => {
//     try {
//         if (!url) return null;

// ملاحظة عربية
//         const part = url.split("/upload/")[1];
//         if (!part) return null;

// ملاحظة عربية
//         const noExt = part.substring(0, part.lastIndexOf("."));
// ملاحظة عربية
//         const noVersion = noExt.substring(noExt.indexOf("/") + 1);

//         const publicId = noVersion.replace(/\.[^/.]+$/, "");
// ملاحظة عربية
//         const deleted = await handleDelete(publicId);
//         console.log("Deleted result:", deleted);
//         return deleted;
//     } catch (err) {
//         console.err("Delete by URL error:", err);
//         return null;
//     }
// }
// module.exports = {
//     handleUpload,
//     handleDelete,
//     handleDeleteByUrl,
// };
