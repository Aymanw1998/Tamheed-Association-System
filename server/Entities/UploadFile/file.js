const cloudinary = require("cloudinary").v2;
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const handleUpload = async (file, folder) => {
    let res = null;
    try{
        console.log("uploading file to cloudinary...", file);
        console.log("folder:", folder);
        const b64 = Buffer.from(file.buffer).toString("base64");
        const dataUri = `data:${file.mimetype};base64,${b64}`;

        res = await cloudinary.uploader.upload(dataUri, {resource_type: "auto", folder: "tamheed/" + folder });
        console.log("add file", res )
        return res;
    }
    catch(err) {
        console.log(err)
        return null;
    }
}

const handleDelete = async (public_id) => {
    
    try{
        const id = public_id;
        console.log("deleting file from cloudinary...", id);
        const res = await cloudinary.uploader.destroy(id,{resource_type: "image"},(result)=>console.log(result));
        console.log("delete file", res )
        return res;
    }
    catch(err) {
        console.log(err)
        return null;
    }
}

const handleDeleteByUrl = async (url) => {
    try {
        if (!url) return null;

        // 1️⃣ מוציאים את החלק אחרי "/upload/"
        const part = url.split("/upload/")[1];
        if (!part) return null;

        // 2️⃣ מורידים את הסיומת (.jpg / .png / .webp)
        const noExt = part.substring(0, part.lastIndexOf("."));
        // 3️⃣ ה־public_id המלא
        const noVersion = noExt.substring(noExt.indexOf("/") + 1);

        const publicId = noVersion.replace(/\.[^/.]+$/, "");
        // מוחקים
        const deleted = await handleDelete(publicId);
        console.log("Deleted result:", deleted);
        return deleted;
    } catch (err) {
        console.err("Delete by URL error:", err);
        return null;
    }
}
module.exports = {
    handleUpload,
    handleDelete,
    handleDeleteByUrl,
};