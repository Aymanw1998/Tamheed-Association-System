
//client one student
import React, { useState, useEffect } from 'react';
import './ViewStudentPage.css';
import { GET, PUT } from '../../services/student/functionStudent';
import PROFILE from '../../../images/profile.png';
import { useNavigate, useParams } from 'react-router-dom';
import UploadImage from '../../UploadImage/UploadImage';
function StudentImage({ src, alt }) {
  const [error, setError] = useState(false);

  return (
    <img
      src={error || !src ? PROFILE : src}
      alt={alt}
      onError={() => setError(true)}
      className="student-image"
    />
  );
}

export default function ViewStudentPage() {
  const {tz} = useParams();
  const [student, setStudent] = useState([]);
  const navigate = useNavigate();
  useEffect(()=>{
      const token = localStorage.getItem("authToken");
      const tokenExp = localStorage.getItem("tokenExpiry");
      if(!token || !tokenExp) {alert("لم يعد لديك صلاحية للدخول");navigate('/'); /*window.location.reload();*/}
  },[])

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
    };
  const translateLabel = (key) => {
    return labels[key] || key;
  };

  useEffect(() => {
    async function fetchStudent() {
      try {

        const res = await GET(tz);
        console.log("studentOne ", tz, res);
        setStudent(res || []);
      } catch (error) {
        console.error('שגיאה בטעינת תלמידים:', error);
      }
    }

    fetchStudent();
  }, []);

      const [errors, setErrors] = useState({});
  
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

    const [onlyRead, setOnlyRead] = useState(true);

    const handleSubmit = async () => {
      const validationErrors = validate();
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
      } else {
      try {
          const payload = { ...student };
          const studenttest = await PUT(student.tz, payload);
          if (studenttest.length > 0) {
          alert('تم إرسال البيانات بنجاح!');
          // handlePrint();
          } else {
          alert("فشل في حفظ البيانات");
          }
      } catch (error) {
          console.error('❌ Error saving student:', error);
          alert('حدث خطأ أثناء حفظ البيانات');
      }
      }
  };

  // הפונקציה שתקבל את כתובת התמונה מהרכיב
    const handleImageUpload = (url) => {
        setStudent(prev => ({ ...prev, image_url: url }));
    };
    
  return (
          <div className="printable flex gap-8 items-start flex-col p-8">
            <div className="flex-1 space-y-3 text-right">
              <h2 className="text-2xl font-bold mb-4 border-b pb-2">بيانات الطالب {student.tz} - {student.firstname + " " + student.lastname} </h2>
              {onlyRead ? <StudentImage src={student.image_url} alt={`תמונת תלמיד של ${student.firstname}`}/>: <UploadImage onImageUpload={handleImageUpload} />}
                <table className="table-auto tableSO">
                <tbody>
                {Object.entries(student).map(([key, value]) => {
                    if(["_id", "image_url", "__v", "create", "uplude"].includes(key)) return;
                    return <tr key={key}>
                    <th className="p-5 m-5">{translateLabel(key)}:</th>
                    <td>
                        {key !== "gender" &&<input type={key == "birth_date" ? "date" : "text" } disabled={key=="tz" ? true : onlyRead} name={key} value={value} onChange={handleChange} className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:border-blue-300"/>}
                        {key == "gender" && <select name={key} value={value} onChange={handleChange} disabled={key=="tz" ? true : onlyRead} className="w-full px-4 py-2 border rounded">
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
            <br/>
            { onlyRead ? 
                <><button type='submit' className="edit-button" onClick={()=>{setOnlyRead(false)}}>تعديل</button></> :
                <><button type='submit' className="back-button" onClick={()=>{setOnlyRead(true)}}>الغاء</button>
                <button type='submit' className="enter-button" onClick={()=>{handleSubmit();setOnlyRead(true)}}>حفظ</button></>
            }

            </div>
        </div>
  );
}

