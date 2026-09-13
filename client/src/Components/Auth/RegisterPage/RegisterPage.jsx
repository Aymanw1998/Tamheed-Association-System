import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadPhoto } from '../../../WebServer/services/user/functionsUser';
import styles from './RegisterPage.module.css';
import { toast } from '../../../ALERT/SystemToasts';
import { register } from '../../../WebServer/services/auth/fuctionsAuth';
import EyeIcon from '../../UI/EyeIcon';
import Button from '../../UI/Button';

// This page only ever creates a brand-new account (see /register in
// Routes.jsx) — editing an existing user is handled by a separate
// EditUser page, so there is no "edit mode" here.
export default function RegisterPage() {
    const navigate = useNavigate();

    const [form, setForm] = useState({
      tz: "",
      password: "",
      firstname: "",
      lastname: "",
      birth_date: "", // ملاحظة عربية
      gender: "",
      phone: "",
      email: "",
      city: "",
      street: "",
      roles: ["مرشد"],
    });
    const isNew = true;
    const [photo, setPhoto] = useState(null);
    const [error, setError] = useState({
      tz: "",
      password: "",
      firstname: "",
      lastname: "",
      birth_date: "", // ملاحظة عربية
      gender: "",
      phone: "",
      email: "",
      city: "",
      street: "",
      roles: "",
    })

    const [saving, setSaving]   = useState(false);
    const [showPassword, setShowPassword] = useState(false);

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
      // ملاحظة عربية
      setForm((prev) => ({ ...prev, [name]: value }));
      const msg = await validate(name, value);
      setError((prev) => ({ ...prev, [name]: msg }));
    };
  
    const validate = async(name = null, value = null) => {
      if(name === "tz"){
          if (value === "") {
            return "املأ الحقل";
          }
          else if(!isValidIsraeliId(value)){
            return "رقم الهوية غير صالح"
          }
          // Whether this tz already exists can only be confirmed by the
          // (authenticated) server, which isn't reachable from this public
          // registration form — the actual duplicate check happens on
          // submit and surfaces as a toast from the register() call below.
          return ""
        }

        //fisrtname, lastname
        else if(['firstname', 'lastname', 'father_name', 'mother_name'].includes(name)){
          if (value === "") {
            return "املأ الحقل";
          }
          return ""
        }

        //gender, role
        else if(['gender', 'roles'].includes(name)){
          if (name === 'gender' && !['ذكر' , 'انثى'].includes(value)) {
            return "اختر الجنس";
          } else if (isNew && name === 'role' && !['ادارة', 'مرشد', 'مساعد'].includes(value)) {
            return "اختر الدور";
          }
          return ""
        }

        else if (name === "birth_date"){
          if(value === "") {
            return "اختر تاريخ الميلاد";
          }
          if (Number.isNaN(new Date(value).getTime())) {
            return "تاريخ غير صالح";
          }
          return "";
        }

        //phone, email, city, street
        else if (['father_phone', 'mother_phone', 'phone', 'email', 'city', 'street'].includes(name)){
          if (value === "") {
            return "املأ الحقل";
          }
          return ""
        }
        else if (name === "roles") {
          if (!value || value.length === 0) return "اختر دورا واحدا على الأقل";
          return "";
        }

        return "";
    }
    const normalizePhoneToIntl = (val) => {
      if (!val) return '';
      let v = String(val).replace(/\D+/g, '');
      // ملاحظة عربية
      if (v.startsWith('972')) v = '+' + v;
      // ملاحظة عربية
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
      const requiredFields = ['tz', 'firstname', 'lastname', 'birth_date', 'gender', 'phone', 'email', 'city', 'street', 'roles'];
      for (const fieldName of requiredFields) {
        const msg = await validate(fieldName, form[fieldName]);
        setError((prev) => ({ ...prev, [fieldName]: msg }));
        if (msg) {
          b = false;
        }
      }
      if(!b) return toast.warn("فحص الحقول المطلوبة");
      e.preventDefault();
      try {
        setSaving(true);

        const payload = { ...form };

        const res = await register(payload);
        if(!res)return;
        if(!res.ok) throw new Error(res.message);
        toast.success(`✅ المستخدم حُفِظ بنجاح`);
        if(photo == null) {navigate(-1);return;}

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
  
    return (
      <div className={styles.formContainer}>
        <h2>اضافة مستخدم جديد</h2>
  
        <label htmlFor="reg-tz">رقم الهوية:</label>
        <input id="reg-tz" name="tz" value={form.tz} onChange={onField} readOnly={!isNew} />
        <span className={styles.fieldError}>{error.tz}</span>
  
        <label htmlFor="reg-password">كلمة السر:</label>
        <div className={styles.passwordWrapper}>
          <input
            id="reg-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={form.password || ''}
            onChange={onField}
          />
          <button
            type="button"
            className={styles.togglePassword}
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            aria-pressed={showPassword}
          >
            <EyeIcon open={showPassword} />
          </button>
        </div>
        <span className={styles.fieldError}>{error.password}</span>

        <label htmlFor="reg-roles">الادوار:</label>
        <select
          id="reg-roles"
          name="roles"
          value={form.roles[0]  || ""}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, roles: [e.target.value] }));
          }}
        >
          <option value="ادارة">ادارة</option>
          <option value="مرشد">مرشد</option>
          <option value="مساعد">مساعد</option>
        </select>
        <span className={styles.fieldError}>{error.roles}</span>

        <label htmlFor="reg-firstname">اسم المستخدم:</label>
        <input
          id="reg-firstname"
          name="firstname"
          value={form.firstname}
          onChange={handleChange}
          required
        />
        <span className={styles.fieldError}>{error.firstname}</span>

        <label htmlFor="reg-lastname">اسم العائلة:</label>
        <input
          id="reg-lastname"
          name="lastname"
          value={form.lastname}
          onChange={handleChange}
          required
        />
        <span className={styles.fieldError}>{error.lastname}</span>

        <label htmlFor="reg-birth_date">تاريخ الميلاد:</label>
        <input
          id="reg-birth_date"
          name="birth_date"
          type="date"
          value={form.birth_date ? String(form.birth_date).slice(0, 10) : ''}
          onChange={onField}
        />
        <span className={styles.fieldError}>{error.birth_date}</span>

        <label htmlFor="reg-gender">جنس:</label>
        <select id="reg-gender" name="gender" value={form.gender} onChange={onField}>
          <option value="">اختار الجنس</option>
          <option value="ذكر">ذكر</option>
          <option value="انثى">انثى</option>
        </select>
        <span className={styles.fieldError}>{error.gender}</span>

        <label htmlFor="reg-phone">هاتف:</label>
        <input
          id="reg-phone"
          name="phone"
          type="tel"
          value={displayPhoneLocal(form.phone)}
          onChange={(e)=>onPhoneChange('phone', e.target.value)}
          placeholder="052-123-4567"
        />
        <span className={styles.fieldError}>{error.phone}</span>

        <label htmlFor="reg-email">بريد الكتروني:</label>
        <input id="reg-email" name="email" type="email" value={form.email} onChange={onField} />
        <span className={styles.fieldError}>{error.email}</span>

        <label htmlFor="reg-city">بلد:</label>
        <input id="reg-city" name="city" value={form.city} onChange={onField} />
        <span className={styles.fieldError}>{error.city}</span>

        <label htmlFor="reg-street">شارع السكن:</label>
        <input id="reg-street" name="street" value={form.street} onChange={onField} />
        <span className={styles.fieldError}>{error.street}</span>

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
          }> {photo? "تعديل الاختيار" : "اختر صورة"} </button>
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
          <Button type="submit" onClick={handleSubmit} loading={saving}>اضافة المستخدم</Button>
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>الرجوع</Button>
        </div>
      </div>
    );
}
