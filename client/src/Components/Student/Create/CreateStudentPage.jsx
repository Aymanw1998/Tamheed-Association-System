import React, { useState, useRef, useEffect } from 'react';
import "./CreateStudentPage.css"
import { useReactToPrint } from "react-to-print";
import UploadImage from '../../UploadImage/UploadImage';  // ייבוא הרכיב החדש

import {POST} from "./../../services/student/functionStudent"
import { useNavigate } from 'react-router-dom';
export default function CreateStudentPage() {
    const navigate = useNavigate();
    const [image, setImage] = useState();
    const [student, setStudent] = useState({
        tz: '',
        firstname: '',
        lastname: '',
        birth_date: '',
        gender: '',
        phone: '',
        email: '',
        father_name: '',
        mother_name: '',
        father_phone: '',
        mother_phone: '',
        city: '',
        street: '',
        image_url: ''  // נוסיף שדה לתמונה
    });
    useEffect(()=>{
        const token = localStorage.getItem("authToken");
        const tokenExp = localStorage.getItem("tokenExpiry");
        if(!token || !tokenExp) {alert("لم يعد لديك صلاحية للدخول");navigate('/'); /*window.location.reload();*/}
    },[])
    useEffect(()=>console.log(student), [student])
    const [errors, setErrors] = useState({});
    const componentRef = useRef(null);

    const validate = () => {
        const newErrors = {};
        if (!student.tz || !/^\d{9}$/.test(student.tz)) newErrors.tz = 'رقم الهوية يجب ان يكون 9 ارقام مطلوب';
        if (!student.firstname) newErrors.firstname = 'الاسم الشخصي مطلوب';
        if (!student.lastname) newErrors.lastname = 'اسم العائلة مطلوب';
        if (!student.phone || !/^05\d{8}$/.test(student.phone)) newErrors.phone = 'رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام';
        if (!student.email || !/\S+@\S+\.\S+/.test(student.email)) newErrors.email = 'البريد غير صالح';
        if (!student.father_name) newErrors.father_name = 'اسم الاب مطلوبة (او لا اعلم)';
        if (!student.mother_name) newErrors.mother_name = 'اسم الام مطلوبة (او لا اعلم)';
        if (!student.father_phone || !/^05\d{8}$/.test(student.father_phone)) newErrors.father_phone = 'رقم الاب مطلوبة (0512345678)';
        if (!student.mother_phone || !/^05\d{8}$/.test(student.mother_phone)) newErrors.mother_phone = 'رقم الام مطلوبة (0512345678)';
        if (!student.city) newErrors.city = "اسم الدينة مطلوب";
        if (!student.street) newErrors.street = "اسم الشارع مطلوب";
        if (!student.birth_date) newErrors.birth_date = "تاريخ الميلاد مطلوب";
        if (!student.gender) newErrors.gender = "جنس الطالب مطلوب";
        return newErrors;
    };

    const handleChange = (e) => {
        setStudent({ ...student, [e.target.name]: e.target.value });
        setErrors({ ...errors, [e.target.name]: '' });
    };

  // הפונקציה שתקבל את כתובת התמונה מהרכיב
    const handleImageUpload = (url) => {
        setStudent(prev => ({ ...prev, image_url: url }));
    };

    const handlePrint = useReactToPrint({
        documentTitle: `${student.firstname}-${student.lastname}`,
        content: () => componentRef.current
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        const validationErrors = validate();
        if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        } else {
        try {
            const payload = { ...student };
            const studenttest = await POST(payload);
            if (studenttest.length > 0) {
            alert('تم إرسال البيانات بنجاح!');
            navigate("/get")
            // window.location.reload();
            // handlePrint();
            } else {
            alert("فشل في حفظ البيانات");
            }
        } catch (err) {
            console.error('❌ Error saving student:', err);
            alert(err.response?.data.warning || err.message);
        }
        }
    };

    const translateLabel = (key) => {
        const labels = {
        tz: 'رقم الهوية',
        firstname: 'الاسم الشخصي',
        lastname: 'اسم العائلة',
        birth_date: 'تاريخ الميلاد',
        gender: 'جنس',
        phone: 'رقم الطالب',
        email: 'بريد الالكتروني',
        father_name: 'اسم الاب',
        mother_name: 'اسم الام',
        father_phone: 'رقم الاب',
        mother_phone: 'رقم الام',
        city: 'البلد',
        street: 'الشارع',
        image_url: 'صورة الطالب',
        };
        return labels[key] || key;
    };

    return (
        <>
            <div className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-lg rounded-lg border print:hidden">
            <h2 className="text-3xl font-bold mb-6 text-center text-gray-800 border-b pb-2">
            استمارة البيانات الشخصية للطالب
            </h2>
            <form onSubmit={handleSubmit} className="space-y-5">
                {student.image_url ? <img
                    src={student.image_url}
                    alt="صورة الطالب"
                    width={"30%"}
                    className="w-40 h-40 object-cover border rounded shadow-md"
                    />
                    :
                    <UploadImage onImageUpload={handleImageUpload} />}
                <table className="table-auto">
                    <tbody>
                    {Object.entries(student).map(([key, value]) => {
                        if(key == "image_url")return;
                        return <tr className="flex flex-col mb-3 text-right">
                                <th className="mb-1 font-bold">{translateLabel(key)}:</th>
                                <td>
                                    
                                    {key !== "gender" &&<input type={key == "birth_date" ? "date" : "text" } name={key} value={value} onChange={handleChange} className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:border-blue-300"/>}
                                    {key == "gender" && <select name={key} value={value} onChange={handleChange} className="w-full px-4 py-2 border rounded">
                                                            <option value="">-- اختر الجنس --</option>
                                                            <option value="أنثى">أنثى</option>
                                                            <option value="ذكر">ذكر</option>
                                                        </select>
                                    }
                                    {errors[key] && <p className="err-text">{errors[key]}</p>}
                                </td>
                            </tr>
                    })}
                    </tbody>
                </table>
                <button type='submit' className="enter-button">حفظ</button>
            </form>
        </div>

        {/* <div
            className="pdf printable flex gap-8 items-start flex-col p-8"
            ref={componentRef}
        >
            <div className="flex-1 space-y-3 text-right">
            <h2 className="text-2xl font-bold mb-4 border-b pb-2">
                بيانات الطالب {student.tz} - {student.firstname + " " + student.lastname}
            </h2>
            <table className="table-auto">
                <tbody>
                {Object.entries(student).map(([key, value]) => {
                    return <tr key={key}>
                    <th className="p-3">{translateLabel(key)}:</th>
                    <td>{value}</td>
                    </tr>
                })}
                {student.image_url && (
                    <tr>
                    <th className="p-3">صورة شخصية:</th>
                    <td>
                        <img
                        src={student.image_url}
                        alt="صورة الطالب"
                        className="w-40 h-40 object-cover border rounded shadow-md"
                        />
                    </td>
                    </tr>
                )}
                </tbody>
            </table>
            </div>
        </div> */}
        </>
    );
}
