import React, { useState, useEffect } from 'react';
import './ViewStudentsPage.css';
import { GET, DELETE } from '../../services/student/functionStudent';
import PROFILE from '../../../images/profile.png';
import { useNavigate } from 'react-router-dom';

function StudentImage({ src, alt }) {

  const [error, setError] = useState(false);

  return (
    <img
      src={error || !src ? PROFILE : src}
      alt={alt}
      onError={() => setError(true)}
      className="student-images"
    />
  );
}

export default function ViewStudentPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(()=>{
    console.log("toekn", localStorage.getItem("authToken"));
    console.log("tokenExp", localStorage.getItem("tokenExpiry"));
        console.log("user", localStorage.getItem("user"));


  },[])
  useEffect(()=>{
      const token = localStorage.getItem("authToken");
      const tokenExp = localStorage.getItem("tokenExpiry");
      if(!token || !tokenExp) {alert("لم يعد لديك صلاحية للدخول");navigate('/');}
  },[])

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
      more: 'فعاليات',
      open: 'ادخل',
      delete: 'حذف'
      
    };
    return labels[key] || key;
  };

  const handleDelete = async (tz) => {
    const confirm = window.confirm('هل أنت متأكد من حذف الطالب؟');
    if (!confirm) return;

    try {
      await DELETE(tz);
      setStudents((prev) => prev.filter((s) => s.tz !== tz));
    } catch (error) {
      console.error('שגיאה במחיקת תלמיד:', error);
      alert('فشل الحذف');
    }
  };


  useEffect(() => {
    async function fetchStudents() {
      try {
        const res = await GET();
        setStudents(res || []);
      } catch (error) {
        console.error('שגיאה בטעינת תלמידים:', error);
      }
    }

    fetchStudents();
  }, []);

  const filteredStudents = students.filter((student) =>
    Object.values(student).join(' ').toLowerCase().includes(searchTerm.toLowerCase())
  );

  //גודל מסך
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="student-list-container">
      <h2 className="title">قائمة الطلاب</h2>

      <input
        type="text"
        placeholder="חפש תלמיד"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="search-input"
      />
      {" "}<button className="enter-button" onClick={()=>{navigate(`/dashboard/post`);/*window.location.reload();*/}}>اضافة</button>

      <div className="table-wrapper">
        {isMobile &&
        <div className="card-list">
          {filteredStudents.reverse().map((student, idx) => (
            <div className="student-card" key={idx}>
              <div className="card-header">
                <StudentImage
                  src={student.image_url}
                  alt={`תמונת תלמיד של ${student.firstname}`}
                />
                <h3>{student.firstname} {student.lastname}</h3>
              </div>
              <div className="card-body">
                <p><strong>{translateLabel('tz')}:</strong> {student.tz}</p>
                <p><strong>{translateLabel('phone')}:</strong> {student.phone}</p>
                <p><strong>{translateLabel('email')}:</strong> {student.email}</p>
                <button className="enter-button" onClick={() => {navigate(`${student.tz}`);/*window.location.reload();*/}}>ادخل</button>
                <button className="delete-button" onClick={() => handleDelete(student.tz)}>حذف</button>
              </div>
            </div>
          ))}
        </div>}
        {!isMobile && <table className="student-table">
          <thead>
            <tr>
              {['image_url', 'tz', 'firstname', 'lastname', 'phone', 'email', 'more'].map((key) => (
                <th key={key}>{translateLabel(key)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredStudents.reverse().map((student, idx) => (
              <tr key={idx}>
                <td data-label={translateLabel('image_url')}>
                  <StudentImage
                    src={student.image_url}
                    alt={`תמונת תלמיד של ${student.firstname}`}
                  />
                </td>
                <td data-label={translateLabel('tz')}>{student.tz}</td>
                <td data-label={translateLabel('firstname')}>{student.firstname}</td>
                <td data-label={translateLabel('lastname')}>{student.lastname}</td>
                <td data-label={translateLabel('phone')}>{student.phone}</td>
                <td data-label={translateLabel('email')}>{student.email}</td>
                <td data-label={translateLabel('more')}>
                  <button className="enter-button" onClick={() => {navigate(`${student.tz}`);/*window.location.reload();*/}}>ادخل</button>
                  <button className="delete-button" onClick={() => handleDelete(student.tz)}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>

      {filteredStudents.length === 0 && (
        <p className="no-results">لا توجد نتائج مطابقة.</p>
      )}
    </div>
  );
}
