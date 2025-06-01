import React, { useState } from 'react';
import { apiService } from '../services/api';

import PROFILE from "../../images/profile.png"
export default function UploadImage({ onImageUpload }) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(null);
    const [file, setFile] = useState(null);

    async function uploadImage(file) {
        setUploading(true);
        setError(null);
        try {
        const sigRes = await apiService.get(`/cloudinary-signature`);
        const { signature, timestamp, api_key, cloud_name, folder } = sigRes.data;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', api_key);
        formData.append('timestamp', timestamp);
        formData.append('signature', signature);
        formData.append('folder', folder);

        const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`;

        const uploadRes = await fetch(cloudinaryUrl, {
            method: 'POST',
            body: formData,
        });

        const data = await uploadRes.json();

        if (data.secure_url) {
            setPreview(data.secure_url);
            onImageUpload(data.secure_url);
        } else {
            setError('فشلة الإضافة');
        }
        } catch (e) {
        console.error(e);
        setError('يوجد مشكلة في إضافة الصورة للشبكة');
        }
        setUploading(false);
    }

    const onFileChange = (e) => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = "image/*";
            fileInput.style.display = 'none';
            fileInput.multiple = false; // מאפשר בחירה של מספר קבצים 
            fileInput.onchange = async(e) => {
                const fileT = e.target.files[0];
                if (fileT) {
                    setPreview(URL.createObjectURL(fileT)); // הצגת תצוגה מקדימה מיידית
                    setFile(fileT)
                    uploadImage(fileT);
                }
            }
            fileInput.oncancel = (e) => {
                console.log(e)
                // setLoading(false)
            }
            fileInput.onclose = (e) => {
                console.log(e);
            }
            fileInput.click();
    };

    return (
        <div className="flex flex-col items-center mb-6">
        <label htmlFor="imageUpload" className="cursor-pointer">
            <div className="w-32 h-32 border-2 border-gray-400 rounded-full overflow-hidden flex items-center justify-center hover:border-blue-500 transition">
                <img
                src={preview ? preview : PROFILE}
                alt="Student Preview"
                width={"30%"}
                className="w-full h-full object-cover"
                onClick={onFileChange}
                />
            </div>
        </label>


        {uploading && <p className="text-sm text-blue-600 mt-2">جاري إضافة الصورة...</p>}
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
    );
}
