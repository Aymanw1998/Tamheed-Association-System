const cloudinary = require("cloudinary").v2;

const { handleUpload, handleDelete, handleDeleteByUrl } = require("../UploadFile/file");
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadPhotoC = async (file, type) => {
    const upload = await handleUpload(file, type);
    return upload;
}

const deletePhotoC = async (url) => {
    const deleteF = await handleDeleteByUrl(url);
    return deleteF;
}

module.exports = {
    uploadPhotoC,
    deletePhotoC,
};