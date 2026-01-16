// 📁 src/components/user/EditUser.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getUserById,
  createUser,
} from '../../../WebServer/services/user/functionsUser';
import styles from './RegisterPage.module.css';
import { toast } from '../../../ALERT/SystemToasts';
import { register } from '../../../WebServer/services/auth/fuctionsAuth';

const initialUser = {
  tz: '', password: '',
  firstname: '', lastname: '', birth_date: '',
  gender: '', phone: '', email: '',
  city: window.innerWidth < 768 ? 'רמלה' : '', street: '', role: 'מתאמן', wallet: 0,
  subs: { id: null, start: { day: -1} },
};

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

export default function RegisterPage() {
  
    const params = useParams();              // "new" או _id
    const navigate = useNavigate();
  
    const id = "new";
    const isEdit =false;
    const isNew = !isEdit;
  
    const [form, setForm] = useState({
      tz: "",
      password: "",
      firstname: "",
      lastname: "",
      birth_date: "", // אם תרצה תאריך אמיתי: Date
      gender: "",
      phone: "",
      email: "",
      city: "",
      street: "",
      roles: ["مرشد"],
    });
    useEffect(()=>console.log("form", form), [form])
    const [photo, setPhoto] = useState("");
    const [error, setError] = useState({
      tz: "",
      password: "",
      firstname: "",
      lastname: "",
      birth_date: "", // אם תרצה תאריך אמיתי: Date
      gender: "",
      phone: "",
      email: "",
      city: "",
      street: "",
      roles: "",
    })
  
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving]   = useState(false);
    const [err, setErr]         = useState(null);
    const [showPassword, setShowPassword] = useState(false);
  
    
    useEffect(() => {
      if (isNew) return;
      (async () => {
        try {
          //console.log("load training");
          setLoading(true);
          setErr(null);
          const res = await getOne(id); // מצפה ל-{ status, subs }
          if(!res.ok) throw new Error(res.message);
          if (res) {
            const s = res.user;
            s.roles = s.roles.includes("ادارة") ? ["ادارة"] : (s.roles.includes("مرشد") ? ["مرشد"] : ["مساعد"]);
            setForm(s);
            setPhoto(s.photo || "");
          } else {
            setErr("المستخدم غير موجود");
          }
        } catch (e) {
          setErr("خلل في جلب البيانات");
        } finally {
          setLoading(false);
        }
      })();
    }, [id, isEdit]);
  
    function isValidIsraeliId(id) {
      if (!/^\d{5,9}$/.test(id)) return false;
      id = id.padStart(9, "0");
      let sum = 0;
      for (let i = 0; i < 9; i++) {
        let n = Number(id[i]) * (i % 2 === 0 ? 1 : 2);
        if (n > 9) n -= 9;
        sum += n;
      }
      //console.log("isValidIsraeliId", id, sum, sum % 10 === 0);
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
        //console.log(isNew && value === "");
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
        else if(['gender', 'roles'].includes(name)){
          if (name === 'gender' && !['ذكر' , 'انثى'].includes(value)) {
            tag?.style.setProperty('border', '2px solid red'); // או ישירות סטייל
            return "בחר מין";
          } else if (isNew && name === 'role' && !['ادارة', 'مرشد', 'مساعد'].includes(value)) {
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
            //console.log("birth_date", value, form.birth_date);
            if(value !== ""){
              const date = new Date(value); 
            }
            else {
            tag?.style.setProperty('border', '2px solid red'); // או ישירות סטייל
            return "בחר תאריך לידה";
            }
          } catch {
            //console.log("invalid date");
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
        else if (name === "roles") {
          if (!value || value.length === 0) return "בחר לפחות תפקיד אחד";
          return "";
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
      //console.log(`onField[${name}] = ${String(value)}`, value === '');
      setForm((prev) => ({ ...prev, [name]: value }));
      const msg = await validate(name, value)
      // //console.log("msg", msg);
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
      const ff = ['tz', 'firstname', 'lastname', 'birth_date', 'gender', 'phone', 'email', 'city', 'street', 'roles'];
      for(const nameTag in ff){
        const tag = document.getElementsByName(ff[nameTag])[0];
        //console.log('Tag', tag, ff[nameTag]);
        // //console.log('tag', tag, tag.name, tag.value);
        const msg = await validate(tag.name, tag.value);
        setError((prev) => ({ ...prev, [tag.name]: msg }));
        // //console.log('msg', msg)
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
        //console.log("payload", payload);  
        
        const res = await register(payload);
        if(!res)return;
        if(!res.ok) throw new Error(res.message);
        toast.success(`✅ المستخدم حُفِظ بنجاح`);
        if(photo == "") {navigte(-1);return;}

        const res2 = await uploadPhoto(form.tz, photo);
        if(!res2) return;
        if(!res2.ok) {
          toast.warn("لم يتم تحميل صورة المستخدم: " + res2.message);
        }
        else{
          toast.success("✅ تم تحميل صورة المستخدم بنجاح");
        }
        navigate(-1);
      } catch (e) {
        console.error(e);
        toast.error(e.message || "❌ فشل العملية");
      } finally {
        setSaving(false);
      }
    };
  
    if (loading) return <div className={styles.formContainer}>يتحدث...</div>;
    if (err)      return <div className={styles.formContainer} style={{color:"#b91c1c"}}>{err}</div>;
  
    const toggleRole = (role, checked) => {
      setForm((prev) => {
        const current = prev.roles || [];
  
        return {
          ...prev,
          roles: checked
            ? [...current, role]                         // הוספה
            : current.filter((r) => r !== role),        // הסרה
        };
      });
    }
  
    return (
      <div className={styles.formContainer}>
        <h2>اضافة مستخدم جديد</h2>
  
        <label>رقم الهوية:</label>
        <input name="tz" value={form.tz} onChange={onField} readOnly={!isNew} />
        <label style={{color: "red"}}>{error.tz}</label>
        <br />
  
        <label>كلمة السر:</label>
        <div className={styles.passwordWrapper}>
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={form.password || ''}
            onChange={onField}
          />
          <button
            type="button"
            className={styles.togglePassword}
            onClick={() => setShowPassword((s) => !s)}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
        <label style={{color: "red"}}>{error.password}</label>
        <br />
        
        <label>الادوار:</label>
        <select
          name="roles"
          value={form.roles[0]  || ""}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, roles: [e.target.value] }));
          }}
        >
          <option value="مرشد">مرشد</option>
          <option value="مساعد">مساعد</option>
        </select>
        <label style={{color: "red"}}>{error.roles}</label>
        <br />
        
        
        <label>اسم المستخدم:</label>
        <input
          name="firstname"
          value={form.firstname}
          onChange={handleChange}
          required
        />
        <label style={{color: "red"}}>{error.firstname}</label>
        <br />
        <label>اسم العائلة:</label>
        <input
          name="lastname"
          value={form.lastname}
          onChange={handleChange}
          required
        />
        <label style={{color: "red"}}>{error.lastname}</label>
        <br />
        <label>تاريخ الميلاد:</label>
        <input
          name="birth_date"
          type="date"
          value={form.birth_date ? String(form.birth_date).slice(0, 10) : ''}
          onChange={onField}
        />
        <label style={{color: "red"}}>{error.birth_date}</label>
        <br />
        <label>جنس:</label>
        <select name="gender" value={form.gender} onChange={onField}>
          <option value="">اختار الجنس</option>
          <option value="ذكر">ذكر</option>
          <option value="انثى">انثى</option>
        </select>
        <label style={{color: "red"}}>{error.gender}</label>
        <br />
        <label>هاتف:</label>
        <input
          name="phone"
          value={displayPhoneLocal(form.phone)}
          onChange={(e)=>onPhoneChange('phone', e.target.value)}
          placeholder="052-123-4567"
        />
        <label style={{color: "red"}}>{error.mother_phone}</label>
        <br />
        <label>بريد الكتروني:</label>
        <input name="email" value={form.email} onChange={onField} />
        <label style={{color: "red"}}>{error.email}</label>
  
        <label>بلد:</label>
        <input name="city" value={form.city} onChange={onField} />
        <label style={{color: "red"}}>{error.city}</label>
  
        <label>شارع السكن:</label>
        <input name="street" value={form.street} onChange={onField} />
        <label style={{color: "red"}}>{error.street}</label>
  
        <div style={{ marginBottom: "16px" }}>
          <label>صورة المستخدم:</label>
          <button onClick={
            ()=> {
              const input = document.createElement('input');
              input.type = "file";
              input.accept = "image/*"
              input.onchange = handlePhoto;
              input.capture = "environment";
              input.click();
            }
          }> {photo != "" ? "تعديل الاختيار" : "اختر صورة"} </button>
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
          <button type="submit" onClick={handleSubmit}>اضافة المستخدم</button></div>
      </div>
    );
}
