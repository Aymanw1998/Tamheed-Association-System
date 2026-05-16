import React, { useEffect, useState } from "react";

// ملاحظة عربية
import { create, update, getUserById as getOne, /*softDelete,*/ deleteU, uploadPhoto, deletePhoto, viewPassword } from "../../WebServer/services/user/functionsUser.jsx";
import styles from "./Profile.module.css";
import { toast } from "../../ALERT/SystemToasts.jsx";
import {validate as validateINV, submit as submitFromParent} from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { getMe } from "../../WebServer/services/auth/fuctionsAuth.jsx";

const Profile = ({parent = false}) => {
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
        photo: null,
    });

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
    })

    const [loading, setLoading] = useState(false);
    const [saving, setSaving]   = useState(false);
    const [err, setErr]         = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [fetchingPassword, setFetchingPassword] = useState(false);
    const [storedPasswordValue, setStoredPasswordValue] = useState("");
    const [passwordAlgo, setPasswordAlgo] = useState("");
    const [passwordTouched, setPasswordTouched] = useState(false);


    useEffect(() => {
        (async () => {
        try {
            //console.log("load training");
            setLoading(true);
            setErr(null);
            const res = await getMe(); // ملاحظة عربية
            if (res) {
                const s = res;
                delete s.password;
                delete s.createdAt;
                delete s.updatedAt;
                delete s.__v;
                delete s.roles;
                setForm(s);
                setPhoto(s.photo || null);
                setStoredPasswordValue("");
                setPasswordAlgo("");
            } else {
            setErr("خلل في جلب البيانات");
            }
        } catch (e) {
            setErr("خلل في جلب البيانات");
        } finally {
            setLoading(false);
        }
        })();
    }, []);

    const isValidIsraeliId = (id) => {
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
    const handleDeletePhoto = async () => {
        if (!photo) return;
        setPhoto(null);
    }
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


    const handleChange = async(e) => {
        const { name, value } = e.target;
        // ملاحظة عربية
        setForm((prev) => ({ ...prev, [name]: value }));
        const msg = await validate(name, value);
        setError((prev) => ({ ...prev, [name]: msg }));
    };

    const validate = async(name = null, value = null) => {
        const tag = document.getElementsByName(name)[0];
        if(name === "tz"){
            if (value === "") {
            tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
            return "املأ الحقل";
            } 
            else if(!isValidIsraeliId(value)){
            tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
            return "رقم الهوية غير صالح"
            }
            tag?.style.setProperty('border', '2px solid green'); // ملاحظة عربية
            return ""
        }

        //fisrtname, lastname
        else if(['firstname', 'lastname', 'father_name', 'mother_name'].includes(name)){
            if (value === "") {
            tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
            return "املأ الحقل";
            } 
            else{
            tag?.style.setProperty('border', '2px solid green'); // ملاحظة عربية
            return ""
            }
        }

        //gender, role
        else if(['gender', 'roles'].includes(name)){
            if (name === 'gender' && !['ذكر' , 'انثى'].includes(value)) {
            tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
            return "اختر الجنس";
            } else if (name === 'role' && !['ادارة', 'مرشد', 'مساعد'].includes(value)) {
            tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
            return "اختر الدور";
            }  
            else{
            tag?.style.setProperty('border', '2px solid green'); // ملاحظة عربية
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
            tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
            return "اختر تاريخ الميلاد";
            }
            } catch {
            //console.log("invalid date");
            tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
            return "تاريخ غير صالح";
            }
        }

        //phone, email, city, street
        else if (['father_phone', 'mother_phone', 'phone', 'email', 'city', 'street'].includes(name)){
            if (value === "") {
            tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
            return "املأ الحقل";
            } 
            else{
            tag?.style.setProperty('border', '2px solid green'); // ملاحظة عربية
            return ""
            }
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
        if (name === "password") setPasswordTouched(true);
        const msg = await validate(name, value)
        // //console.log("msg", msg);
        setError((prev) => ({ ...prev, [name]: msg }));
    };

    const onPhoneChange = (tag, text) => {
        const local = text.replace(/[^\d-]/g, '');
        const intl = normalizePhoneToIntl(local);
        setForm((prev) => ({ ...prev, [tag]: intl }));
    };

    const handleFetchPassword = async () => {
        try {
            setFetchingPassword(true);
            const tzToFetch = String(form.tz || "").trim();
            if (!tzToFetch) return;

            const res = await viewPassword(tzToFetch);
            if (!res?.ok) {
                toast.warn(res?.message || "لا يمكن عرض كلمة المرور لهذا المستخدم");
                return;
            }

            setStoredPasswordValue(
                String(res.encryptedPassword || res.hashedPassword || res.storedPassword || "")
            );
            setPasswordAlgo(String(res.algo || ""));

            if (typeof res.password === "string") {
                setForm((prev) => ({ ...prev, password: res.password }));
                setShowPassword(true);
                setPasswordTouched(false);
            } else {
                setShowPassword(false);
                setForm((prev) => ({ ...prev, password: "" }));
                toast.warn(res?.message || "لم يتم استلام كلمة مرور");
            }
        } catch (e) {
            console.error(e);
            toast.error("خطأ في جلب كلمة المرور");
        } finally {
            setFetchingPassword(false);
        }
    };

    const handleSubmit = async (e) => {
        let b = await validate();
        if (b) { toast.warn(b); return; }
        b = true
        const ff = ['tz', 'firstname', 'lastname', 'birth_date', 'gender', 'phone', 'email', 'city', 'street'];
        for(const nameTag in ff){
            const tag = document.getElementsByName(ff[nameTag])[0];
            //console.log('Tag', tag, ff[nameTag]);
            console.log('tag', tag);
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
            if (!passwordTouched || !form.password?.trim()) {
                delete payload.password;
            }
            //console.log("payload", payload);  
            if(parent && !inviteToken){
                toast.error("رابط التسجيل غير صالح");
                return;
            }
            
            var bb = await handleDeletePhotoWithSave();
            console.log("deletePhotoWithSave", bb);
            if(bb) {
                payload.photo = null;
            }
            const res = await update(form.tz, payload);
            if(!res) return;
            if(!res.ok) throw new Error(res.message);
            toast.success(`✅ الملف الشخصي تم تحديثه بنجاح`);

            if (photo instanceof File) {
                const res2 = await uploadPhoto(form.tz, photo);
                if(!res2) return;
                if(!res2.ok) {
                    toast.warn("لم يتم تحميل صورة : " + res2.message);
                }
                else{
                    setPhoto(res2.photo || null);
                    toast.success("✅ تم تحميل صورة بنجاح");
                }
            }
        } catch (e) {
            console.error(e);
            toast.error(e.message || "❌ فشل العملية");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className={styles.formContainer}>يتحدث...</div>;
    if (err)      return <div className={styles.formContainer} style={{color:"#b91c1c"}}>{err}</div>;


    return (
        <div className={styles.formContainer}>
        <h2>الملف الشخصي</h2>

        <label>رقم الهوية:</label>
        <input name="tz" value={form.tz} onChange={onField} readOnly={true} />
        <label style={{color: "red"}}>{error.tz}</label>
        <br />

        <label>كلمة السر:</label>
        <div className={styles.passwordWrapper}>
            <input
                name="password"
                type={showPassword ? "text" : "password"}
                value={form.password || ""}
                onChange={onField}
                placeholder="*******"
            />
            <button
                type="button"
                className={styles.togglePassword}
                disabled={fetchingPassword}
                onClick={async () => {
                    if (!showPassword) {
                        if (!form.password?.trim() || !passwordTouched) {
                            await handleFetchPassword();
                        }
                        setShowPassword(true);
                        return;
                    }

                    setShowPassword(false);
                    if (!passwordTouched) {
                        setForm((prev) => ({ ...prev, password: "" }));
                    }
                }}
                title={showPassword ? "إخفاء كلمة السر" : "إظهار كلمة السر"}
            >
                {fetchingPassword ? "⏳" : (showPassword ? "🙈" : "👁️")}
            </button>
        </div>
        {/* {!!storedPasswordValue && (
            <>
                <label>القيمة المحفوظة ({passwordAlgo || "stored"}):</label>
                <textarea
                    readOnly
                    value={storedPasswordValue}
                    style={{ width: "100%", minHeight: "90px", direction: "ltr" }}
                />
                <small style={{ color: "#374151", display: "block", marginTop: "4px" }}>
                    لتغيير كلمة السر عدل الحقل الأعلى ثم اضغط حفظ. سيتم حفظها مشفرة تلقائياً.
                </small>
            </>
        )} */}
        <label style={{color: "red"}}>{error.password}</label>
        <br />

        <label>اسمي:</label>
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
            }> {photo ? "تعديل الاختيار" : "اختر صورة"} </button>
            {photo && (
                <button type="button" onClick={handleDeletePhoto} style={{ marginInlineStart: "8px" }}>
                    حذف الصورة
                </button>
            )}
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
            <button type="submit" onClick={handleSubmit}>
            {saving ? "حفظ..." :  "تعديل البيانات"}
            </button>
        </div>
        </div>
    );
};

export default Profile;
