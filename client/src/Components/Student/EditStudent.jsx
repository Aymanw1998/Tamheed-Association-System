import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
// עדכן נתיב אם אצלך שונה:
import { create, update, getOne, /*softDelete,*/ deleteS, uploadPhoto, deletePhoto } from "../../WebServer/services/student/functionsStudent.jsx";
import {getAll as getUsers} from "../../WebServer/services/user/functionsUser.jsx"
import styles from "./Student.module.css";
import { toast } from "../../ALERT/SystemToasts";
import {validate as validateINV, submit as submitFromParent} from "../../WebServer/services/inviteToken/functionInviteToken.jsx";

const EditStudent = ({parent = false}) => {
  const params = useParams();              // "new" או _id
  const navigate = useNavigate();

  const id = parent ? "new" : params.id;
  const isEdit =!parent && id !== "new";
  const isNew = !isEdit;

  const [form, setForm] = useState({
    tz: "",
    firstname: "",
    lastname: "",
    birth_date: "", // אם תרצה תאריך אמיתי: Date
    gender: "",
    phone: "",
    email: "",
    city: "الرملة",
    street: "",
    father_name: "",
    mother_name: "",
    father_phone: "",
    mother_phone: "",
    father_work: "",
    mother_work: "",
    school: "",
    layer: "",
    health_status: "",
    notes: "",
    main_teacher: null,
    photo: null,
  });

  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState({
    tz: "",
    firstname: "",
    lastname: "",
    birth_date: "", // אם תרצה תאריך אמיתי: Date
    gender: "",
    phone: "",
    email: "",
    city: "",
    street: "",
    father_name: "",
    mother_name: "",
    father_phone: "",
    mother_phone: "",
    father_work: "",
    mother_work: "",
    school: "",
    layer: "",
    health_status: "",
    notes: "",
  })

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState(null);


  // invite token למצב הורה
  const [inviteToken, setInviteToken] = useState(null);
  const [inviteStatus, setInviteStatus] = useState({
    checking: parent,   // אם זה דף הורה – נבדוק טוקן
    valid: !parent,     // אם זה אדמין – תמיד תקף
    message: "",
  });

  
  const [teachers, setTeachers] = useState(null);
  
  const loadTeachers = async() => {
    //teachers
    if(parent) return;
    try{
      const res = await getUsers();
      res.ok ? setTeachers(res.users.filter(u => u.roles[0] == "مرشد")): setTeachers([]);
    } catch(err) {
      setTeachers([])
    }
  }
  useEffect(()=>{loadTeachers()},[])

  useEffect(() => {
    if (!isEdit) return;
    if  (parent) return;
    (async () => {
      try {
        console.log("load training");
        setLoading(true);
        setErr(null);
        const res = await getOne(id); // מצפה ל-{ status, subs }
        if(!res.ok) throw new Error(res.message);
        if (res) {
          const s = res.student;
          setForm(s);
          setPhoto(s.photo || null);
        } else {
          setErr("الطالب غير موجود");
        }
      } catch (e) {
        setErr("خلل في جلب البيانات");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

    // 🔹 בדיקת invite token במצב הורה (דף חיצוני)
  useEffect(() => {
    if (!parent) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");

    if (!token) {
      setInviteStatus({
        checking: false,
        valid: false,
        message: "קישור לא תקין (חסר מזהה הרשמה)",
      });
      return;
    }

    setInviteToken(token);

    (async () => {
      try {
        setInviteStatus((prev) => ({ ...prev, checking: true }));
        const res = await validateINV(token);
        console.log("validate invite token", res);
        // נניח שהפונקציה מחזירה { valid, message }
        if (!res.valid) {
          setInviteStatus({
            checking: false,
            valid: false,
            message: res?.message || "הקישור אינו תקף",
          });
        } else {
          setInviteStatus({ checking: false, valid: true, message: "" });
        }
      } catch (e) {
        console.error(e);
        setInviteStatus({
          checking: false,
          valid: false,
          message: "שגיאה בבדיקת הקישור",
        });
      }
    })();
  }, [parent]);

  function isValidIsraeliId(id) {
    if (!/^\d{5,9}$/.test(id)) return false;
    id = id.padStart(9, "0");
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let n = Number(id[i]) * (i % 2 === 0 ? 1 : 2);
      if (n > 9) n -= 9;
      sum += n;
    }
    console.log("isValidIsraeliId", id, sum, sum % 10 === 0);
    return sum % 10 === 0;
  }

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhoto(file);
  };


  const handleChange = async(e) => {
    const { name, value } = e.target;
    // שמור כטקסט; נמיר למספרים בזמן שמירה
    setForm((prev) => ({ ...prev, [name]: value }));
    const msg = await validate(name, value);
    setError((prev) => ({ ...prev, [name]: msg }));
  };

  const validate = async(name = null, value = null) => {
    const tag = document.getElementsByName(name)[0];
    if(name === "tz"){
      console.log(isNew && value === "");
        if (value === "") {
          tag?.style.setProperty('border', '2px solid red'); // או ישירות סטייל
          return "מלאה שדה";
        } 
        else if(!isValidIsraeliId(value)){
          tag?.style.setProperty('border', '2px solid red'); // או ישירות סטייל
          return "תעודת זיהות לא חוקית"
        }
        else if(isNew) {
          const data = parent ? {ok: false} : await getOne(value)
          if(data.ok){
            tag?.style.setProperty('border', '2px solid red'); // או ישירות סטייל
            return "תעודת זיהות קיימת במערכת"
          } 
        }
        tag?.style.setProperty('border', '2px solid green'); // או ישירות סטייל
        return ""
      }

      //fisrtname, lastname
      else if(['firstname', 'lastname', 'father_name', 'mother_name'].includes(name)){
        if (value === "") {
          tag?.style.setProperty('border', '2px solid red'); // או ישירות סטייל
          return "מלאה שדה";
        } 
        else{
          tag?.style.setProperty('border', '2px solid green'); // או ישירות סטייל
          return ""
        }
      }

      //gender, role
      else if(['gender', 'role'].includes(name)){
        if (name === 'gender' && !['ذكر' , 'انثى'].includes(value)) {
          tag?.style.setProperty('border', '2px solid red'); // או ישירות סטייל
          return "בחר מין";
        } else if (isNew && name === 'role' && !['ادارة', 'מאמן', 'מתאמן'].includes(value)) {
          tag?.style.setProperty('border', '2px solid red'); // או ישירות סטייל
          return "בחר תפקיד";
        }  
        else{
          tag?.style.setProperty('border', '2px solid green'); // או ישירות סטייל
          return ""
        }
      }

      else if (name === "birth_date"){
        try{
          console.log("birth_date", value, form.birth_date);
          if(value !== ""){
            const date = new Date(value); 
          }
          else {
          tag?.style.setProperty('border', '2px solid red'); // או ישירות סטייל
          return "בחר תאריך לידה";
          }
        } catch {
          console.log("invalid date");
          tag?.style.setProperty('border', '2px solid red'); // או ישירות סטייל
          return "תאריך לא חוקי";
        }
      }

      //phone, email, city, street
      else if (['father_phone', 'mother_phone', 'phone', 'email', 'city', 'street'].includes(name)){
        if (value === "") {
          tag?.style.setProperty('border', '2px solid red'); // או ישירות סטייל
          return "מלאה שדה";
        } 
        else{
          tag?.style.setProperty('border', '2px solid green'); // או ישירות סטייל
          return ""
        }
      }
      return ""; 
  }
  const normalizePhoneToIntl = (val) => {
    if (!val) return '';
    let v = String(val).replace(/\D+/g, '');
    // אם מתחיל ב-972 בלי +
    if (v.startsWith('972')) v = '+' + v;
    // אם מתחיל ב-0 ישראלי → +972
    if (v.startsWith('0')) v = '+972' + v.slice(1);
    if (!v.startsWith('+')) v = '+' + v;
    return v;
  };

  const displayPhoneLocal = (val) => {
    if (!val) return '';
    let v = String(val);
    if (v.startsWith('+972')) v = '0' + v.slice(4);
    return v.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3'); // 05x-xxx-xxxx
  };

  const onField = async(e) => {
    const { name, value } = e.target;
    console.log(`onField[${name}] = ${String(value)}`, value === '');
    setForm((prev) => ({ ...prev, [name]: value }));
    const msg = await validate(name, value)
    // console.log("msg", msg);
    setError((prev) => ({ ...prev, [name]: msg }));
  };

  const onPhoneChange = (tag, text) => {
    const local = text.replace(/[^\d-]/g, '');
    const intl = normalizePhoneToIntl(local);
    setForm((prev) => ({ ...prev, [tag]: intl }));
  };
  const handleSubmit = async (e) => {
    let b = await validate();
    if (b) { toast.warn(b); return; }
    b = true
    const ff = ['tz', 'firstname', 'lastname', 'birth_date', 'gender','layer', 'school', 'health_status', 'city', 'street', 'father_name', 'mother_name', 'father_phone', 'mother_phone', 'father_work', 'mother_work'];
    for(const nameTag in ff){
      const tag = document.getElementsByName(ff[nameTag])[0];
      // console.log('tag', tag, tag.name, tag.value);
      const msg = await validate(tag.name, tag.value);
      setError((prev) => ({ ...prev, [tag.name]: msg }));
      // console.log('msg', msg)
      if(msg && msg !== ''){
        b = false;
      }
    }
    if(!b) return toast.warn("فحص الحقول المطلوبة");
    e.preventDefault();
    try {
      setSaving(true);
      setErr(null);

      const payload = { ...form };
      console.log("data student", payload);
      if(parent && !inviteToken){
          toast.error("קישור הרשמה לא תקין");
          return;
      }
      else if(parent) {
        const res = await submitFromParent(inviteToken, payload);
        console.log("submit from parent", res);
        if (!res || !res.ok) {
          throw new Error(res?.message || "فشل ارسال النموذج");
        }

        toast.success("✅ تم ارسال تفاصيل الطالب بنجاح");
        if(!photo) return;
        const res2 = await uploadPhoto(form.tz, photo);
        if(!res2) return;
        if(!res2.ok) {
          toast.warn("لم يتم تحميل صورة الطالب: " + res2.message);
        }
        else{
          toast.success("✅ تم تحميل صورة الطالب بنجاح");
        }
        // אפשר לנקות טופס, לא מחזירים אחורה
        return;
      }
      
      var bb = await handleDeletePhotoWithSave();
      console.log("deletePhotoWithSave", bb);
      if(bb) {
          payload.photo = null;
      }
      const res = isEdit ? await update(form.tz, payload): await create({...payload});
      console.log("res", res);
      if(!res) return;
      if(!res.ok) throw new Error(res.message);
      toast.success(`✅ الطالب ${isEdit ? 'حُديث' : 'حُفِظ'} بنجاح`);

      const res2 = await uploadPhoto(form.tz, photo);
      if(!res2) return;
      if(!res2.ok) {
        toast.warn("لم يتم تحميل صورة الطالب: " + res2.message);
      }
      else{
        toast.success("✅ تم تحميل صورة الطالب بنجاح");
      }
      navigate(-1);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "❌ فشل العملية");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePhotoWithSave = async () => {
    try {
        const res = await deletePhoto(form.tz);
        if (!res || !res.ok) throw new Error(res?.message || "❌ فشل حذف الصورة");
        setPhoto(null);
        toast.success("✅ تم حذف الصورة بنجاح");
        return true;
    } catch (e) {
        toast.error(e.message || "❌ فشل حذف الصورة");
        return false;
    }
};

  // מחיקה קשיחה (אופציונלי)
  const handleHardDelete = async () => {
    if (!isEdit) return;
    try {
      const res = await deleteS(form.tz);
      if(!res) return;
      if(!res.ok) throw new Error(res.message);

      toast.success("✅ تم الحذف بنجاح");
      navigate(-1);
    } catch (e) {
      toast.error(e.message || "❌ فشل العملية");
    }
  };
  // במצב הורה – קודם בודקים טוקן
  if (parent) {
    if (inviteStatus.checking) {
      return (
        <div className={styles.formContainer}>
          בודק תוקף קישור ההרשמה...
        </div>
      );
    }
    if (!inviteStatus.valid) {
      return (
        <div
          className={styles.formContainer}
          style={{ color: "#b91c1c", textAlign: "center" }}
        >
          <h2>הקישור אינו תקף</h2>
          <p>{inviteStatus.message || "אנא בקש/י קישור חדש מהמורה."}</p>
        </div>
      );
    }
  }

  if (loading) return <div className={styles.formContainer}>يتحدث...</div>;
  if (err)      return <div className={styles.formContainer} style={{color:"#b91c1c"}}>{err}</div>;

  return (
    <div className={styles.formContainer}>
      <h2 style={{textAlign: "center"}}>{isEdit ? "تحديث بيانات الطالب" : "اضافة طالب جديد"}</h2>

      <label>رقم الهوية: <span style={{color: "red"}}>*</span></label>
      <input name="tz" value={form.tz} onChange={onField} readOnly={!isNew} />
      {error.tz != "" && <label style={{color: "red"}}>{error.tz}</label>}
      <br />
      <label>اسم الطالب: <span style={{color: "red"}}>*</span></label>
      <input
        name="firstname"
        value={form.firstname}
        onChange={handleChange}
        required
      />
      {error.firstname != "" && <label style={{color: "red"}}>{error.firstname}</label>}
      <br />
      <label>اسم العائلة: <span style={{color: "red"}}>*</span></label>
      <input
        name="lastname"
        value={form.lastname}
        onChange={handleChange}
        required
      />
      {error.lastname != "" &&<label style={{color: "red"}}>{error.lastname}</label>}
      <br />

      <label>تاريخ الميلاد: <span style={{color: "red"}}>*</span></label>
      <input
        name="birth_date"
        type="date"
        value={form.birth_date ? String(form.birth_date).slice(0, 10) : ''}
        onChange={onField}
      />
      {error.birth_date != "" && <label style={{color: "red"}}>{error.birth_date}</label>}
      <br />
      <label>جنس: <span style={{color: "red"}}>*</span></label>
      <select name="gender" value={form.gender} onChange={onField}>
        <option value="">اختار الجنس</option>
        <option value="ذكر">ذكر</option>
        <option value="انثى">انثى</option>
      </select>
      {error.gender != "" && <label style={{color: "red"}}>{error.gender}</label>}
      <br />
          <label>هاتف:</label>
      <input
        name="phone"
        value={displayPhoneLocal(form.phone)}
        onChange={(e)=>onPhoneChange('phone', e.target.value)}
        placeholder="052-123-4567"
      />
      {error.phone != "" && <label style={{color: "red"}}>{error.phone}</label>}
      <br />
      <label>صف: <span style={{color: "red"}}>*</span></label>
      <input
        name="layer"
        value={form.layer}
        onChange={handleChange}
        required
      />
      { error.layer != "" && <label style={{color: "red"}}>{error.layer}</label>}
      <br />
      <label>مدرسة: <span style={{color: "red"}}>*</span></label>
      <input
        name="school"
        value={form.school}
        onChange={handleChange}
        required
      />
      {error.school != "" && <label style={{color: "red"}}>{error.school}</label>}
      <br />
      <label> الاب <span style={{color: "red"}}>*</span></label>
      <input
        name="father_name"
        value={form.father_name}
        onChange={handleChange}
        placeholder="اسم الاب"
        required
      />
      <input
        name="father_phone"
        value={displayPhoneLocal(form.father_phone)}
        onChange={(e) => onPhoneChange('father_phone', e.target.value)}
        placeholder="052-123-4567"
      />
      <input
        name="father_work"
        value={form.father_work}
        onChange={handleChange}
        placeholder="عمل الاب"
        required
      />
      {error.father_name != "" && <label style={{color: "red"}}>{error.father_name}</label>}
      {error.father_work != "" && <label style={{color: "red"}}>{error.father_work}</label>}
      {error.father_phone != "" && <label style={{color: "red"}}>{error.father_phone}</label>}
      <br />
      
      <label> الام <span style={{color: "red"}}>*</span></label>
      <input
        name="mother_name"
        value={form.mother_name}
        onChange={handleChange}
        placeholder="اسم الام"
        required
      />
      <input
        name="mother_phone"
        value={displayPhoneLocal(form.mother_phone)}
        onChange={(e) => onPhoneChange('mother_phone', e.target.value)}
        placeholder="052-123-4567"
      />
      <input
        name="mother_work"
        value={form.mother_work}
        onChange={handleChange}
        placeholder="عمل الام"
        required
      />
      {error.mother_name != "" && <label style={{color: "red"}}>{error.mother_name}</label>}
      {error.mother_work != "" && <label style={{color: "red"}}>{error.mother_work}</label>}
      {error.mother_phone != "" && <label style={{color: "red"}}>{error.mother_phone}</label>}
      <br />
      <label>الحالة الصحية: <span style={{color: "red"}}>*</span></label>
      <input
        name="health_status"
        value={form.health_status}
        onChange={handleChange}
        required
      />
      {error.health_status != "" &&<label style={{color: "red"}}>{error.health_status}</label>}
      <br />
      <label>بريد الكتروني:</label>
      <input name="email" value={form.email} onChange={onField} />
      {error.email !="" && <label style={{color: "red"}}>{error.email}</label>}
      <br />
      <label>شارع السكن: <span style={{color: "red"}}>*</span></label>
      <input name="street" value={form.street} onChange={onField} />
      {error.street != "" && <label style={{color: "red"}}>{error.street}</label>}
      <br />
      <label>مدينة السكن: <span style={{color: "red"}}>*</span></label>
      <input name="city" value={form.city} onChange={onField} />
      {error.city != "" && <label style={{color: "red"}}>{error.city}</label>}
      <br />
      <label>ملاحظات:</label>
      <input
        name="notes"
        value={form.notes}
        onChange={handleChange}
        required
      />
      {error.notes != "" && <label style={{color: "red"}}>{error.notes}</label>}
      <br />

      {!parent && localStorage.getItem('roles').includes('ادارة') && teachers && teachers.length > 0 && <div className={styles.formControl}>
        <label>مرشد مسؤول:</label>
        <select
          name="main_teacher"
          value={form.main_teacher}
          onChange={handleChange}
          disabled={!localStorage.getItem('roles').includes('ادارة')}
        >
          <option value="">اختار مرشد</option>
          {Array.isArray(teachers) &&
            teachers.map((t) => (
              <option key={t._id} value={t._id}>
                {t.firstname} {t.lastname}
              </option>
            ))}
        </select>
      </div> }
      

      <div style={{ marginBottom: "16px" }}>
        <label>صورة الطالب:</label>
        <button onClick={
          ()=> {
            const input = document.createElement('input');
            input.type = "file";
            input.accept = "image/*"
            input.onchange = handlePhoto;
            input.capture = "environment";
            input.click();
          }
        }> {photo ? "تعديل الاختيار" : "اختر صورة"} </button>
        {photo && <button style={{marginLeft: "18px", backgroundColor: "red"}} onClick={()=>setPhoto(null)}>إزالة الصورة</button>}
        <br />

        {/* معاينة الصورة إذا موجودة */}
        {photo && (
          <img
            src={photo instanceof File ? URL.createObjectURL(photo) : photo}
            alt="preview"
            style={{ width: "120px", height: "120px", objectFit: "cover", borderRadius: "8px", marginTop: "8px" }}
          />
        )}
      </div>

      <div className={styles.buttonRow} style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="submit" onClick={handleSubmit} style={{width:"100%"}}>
          {saving ? "حفظ..." : parent ? "ارسال التفاصيل" : (isEdit ? "تعديل البيانات" : "اضافة الطالب")}
        </button>

        {isEdit && !parent && (
          <center>
            <button type="button" style={{ background: "#7f1d1d", width: "100%" }} onClick={handleHardDelete}>
              حذف
            </button>
          </center>
        )}

        {!parent && (<button type="button" style={{ background: "#6b7280", width: "100%" }} onClick={() => navigate(-1)}>
          الرجوع للقائمة
        </button>)}
      </div>
    </div>
  );
};

export default EditStudent;
