const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORAGE_ROOT = process.env.FILE_STORAGE_ROOT 
const PUBLIC_BASE_URL = process.env.FILE_PUBLIC_BASE_URL 
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

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

const axios = require("axios");
const FormData = require("form-data");
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

    const form = new FormData();

    form.append("file", file.buffer, {
      filename: finalFileName,
      contentType: file.mimetype || "application/octet-stream",
      knownLength: file.size,
    });

    form.append("dbName", dbName);
    form.append("collection", collection);

    const response = await axios.post(
      PUBLIC_BASE_URL + "/upload",
      form,
      {
        headers: {
          ...form.getHeaders(),
          // אם יש לך auth בין השירותים:
          // Authorization: `Bearer ${process.env.GLOBAL_SERVICE_TOKEN}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    return response.data;
  } catch (err) {
    console.error(
      "Remote upload error:",
      err.response?.data || err.message || err
    );
    return null;
  }
}
async function handleDelete(filePathOrUrl) {
  try {
    console.log("handleDelete called with:", filePathOrUrl);
    if (!filePathOrUrl) return null;

    const response = await axios.delete(
      PUBLIC_BASE_URL + "/delete",
      {
        data: {
          url: filePathOrUrl,
        },
        headers: {
          // Authorization: `Bearer ${process.env.GLOBAL_SERVICE_TOKEN}`,
        },
      }
    );

    return response.data;
  } catch (err) {
    console.error(
      "Remote delete error:",
      err.response?.data || err.message || err
    );
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

//         // 1️⃣ מוציאים את החלק אחרי "/upload/"
//         const part = url.split("/upload/")[1];
//         if (!part) return null;

//         // 2️⃣ מורידים את הסיומת (.jpg / .png / .webp)
//         const noExt = part.substring(0, part.lastIndexOf("."));
//         // 3️⃣ ה־public_id המלא
//         const noVersion = noExt.substring(noExt.indexOf("/") + 1);

//         const publicId = noVersion.replace(/\.[^/.]+$/, "");
//         // מוחקים
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
