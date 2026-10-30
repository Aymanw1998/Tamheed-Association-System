import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
// ملاحظة عربية
import { create, update, getOne, /*softDelete,*/ deleteS, uploadPhoto, deletePhoto } from "../../WebServer/services/student/functionsStudent.jsx";
import {getAll as getUsers} from "../../WebServer/services/user/functionsUser.jsx"
import styles from "./Student.module.css";
import sectionStyles from "../UI/FormSection.module.css";
import { toast } from "../../ALERT/SystemToasts";
import {validate as validateINV, submit as submitFromParent} from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { canStored } from "../../utils/session";
import { photoAction } from "../../utils/photoChange";
import { passportSrc, PASSPORT_PREVIEW } from "../../utils/passportPhoto";
import { usePhotoPick, PHOTO_NOT_READY } from "../../utils/photoPick";
import { isRequiredStudentField, responsibleGuideOptions } from "../../utils/studentForm";
import RecentChanges from "../Audit/RecentChanges.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { isValidIsraeliId } from "../../utils/israeliId";
import useItemLock from "../../locks/useItemLock";
import LockedScreen from "../../locks/LockedScreen";
import ReadOnlyArea from "../../locks/ReadOnlyArea";
import SaveNotice from "../../locks/SaveNotice";
import forceRelease from "../../locks/forceRelease";
import useReloadOnUnblock from "../../locks/useReloadOnUnblock";
import { handleSaveError, withBaseVersion } from "../../locks/staleSave";
import { useLockRecovery } from "../../locks/LockLostBanner";

const EditStudent = ({parent = false}) => {
  const params = useParams();              // "new" الأحدالجمعة _id
  const navigate = useNavigate();
  const { t } = useI18n();
  // Only holders of students.viewAll may name the responsible guide (the server ignores it otherwise).
  const canAssignGuide = canStored("students.viewAll") && canStored("users.view");

  const id = parent ? "new" : params.id;
  const isEdit =!parent && id !== "new";
  const isNew = !isEdit;

  const [form, setForm] = useState({
    tz: "",
    firstname: "",
    lastname: "",
    birth_date: "", // ملاحظة عربية
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
  // Tracks the photo that was actually on the server when the page loaded,
  // so saving unrelated fields never touches it unless the admin explicitly
  // picked a new file or removed it (see handleSubmit).
  const [originalPhoto, setOriginalPhoto] = useState(null);
  const [error, setError] = useState({
    tz: "",
    firstname: "",
    lastname: "",
    birth_date: "", // ملاحظة عربية
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
  // The document as opened: its updatedAt is the baseVersion of the save.
  const [opened, setOpened]   = useState(null);
  const [notice, setNotice]   = useState(null);
  // Students are opened by ID number, but the lock is on the stored _id.
  const lockKey = isEdit && !parent && opened?._id ? `student:${opened._id}` : null;
  const lock = useItemLock(lockKey, { enabled: canStored("students.edit") });
  const readonly = lock.status === "readonly";


  // Parents arrive through the fixed registration link /register-student/:token.
  const registrationToken = parent ? params.token : null;
  const [inviteStatus, setInviteStatus] = useState({
    checking: parent,
    valid: !parent,
    open: true,
  });
  const [submitted, setSubmitted] = useState(false);

  
  const [instructors, setInstructors] = useState([]);

  const loadTeachers = async() => {
    if(parent) return;
    try{
      const res = await getUsers();
      // Every account the server lists (the system account is already left out).
      setInstructors(res.ok ? res.users : []);
    } catch(err) {
      setInstructors([]);
    }
  }
  useEffect(()=>{loadTeachers()},[])

  const load = async () => {
    try {
      setLoading(true);
      setErr(null);
      const res = await getOne(id); // ملاحظة عربية
      if(!res.ok) throw new Error(res.message);
      if (res) {
        const s = res.student;
        setForm({ ...s, main_teacher: s.main_teacher || "" });
        setPhoto(s.photo || null);
        setOriginalPhoto(s.photo || null);
        setOpened(s);
      } else {
        setErr("الطالب غير موجود");
      }
    } catch (e) {
      setErr("تعذّر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isEdit) return;
    if  (parent) return;
    load();
  }, [id, isEdit]);

  useReloadOnUnblock(lock.status, load);
  const recovery = useLockRecovery(lock, { reload: load, draft: [form.health_status, form.notes].filter(Boolean).join("\n") });

    // ملاحظة عربية
  useEffect(() => {
    if (!parent) return;
    if (!registrationToken) {
      setInviteStatus({ checking: false, valid: false, open: false });
      return;
    }
    (async () => {
      const res = await validateINV(registrationToken);
      setInviteStatus({ checking: false, valid: res.valid, open: res.open });
    })();
  }, [parent, registrationToken]);

  const photoPick = usePhotoPick(setPhoto, toast.warn, { scope: id });
  const handlePhoto = (e) => photoPick.pick(e.target.files[0]);


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
          return "هذا الحقل مطلوب";
        } 
        else if(!isValidIsraeliId(value)){
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "رقم الهوية غير صالح"
        }
        else if(isNew) {
          const data = parent ? {ok: false} : await getOne(value)
          if(data.ok){
            tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
            return "رقم الهوية مسجّل مسبقًا في النظام"
          } 
        }
        tag?.style.setProperty('border', '2px solid green'); // ملاحظة عربية
        return ""
      }

      // Optional text fields (parents, phone, email) may stay empty.
      else if (['father_name', 'mother_name', 'father_phone', 'mother_phone', 'phone', 'email'].includes(name)
        && !isRequiredStudentField(name)) {
        tag?.style.removeProperty('border');
        return "";
      }

      //fisrtname, lastname
      else if(['firstname', 'lastname'].includes(name)){
        if (value === "") {
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "هذا الحقل مطلوب";
        } 
        else{
          tag?.style.setProperty('border', '2px solid green'); // ملاحظة عربية
          return ""
        }
      }

      //gender, role
      else if(['gender', 'role'].includes(name)){
        if (name === 'gender' && !['ذكر' , 'انثى'].includes(value)) {
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "اختر الجنس";
        } else if (isNew && name === 'role' && !['ادارة', 'مدرب', 'متدرب'].includes(value)) {
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
          if(value !== ""){
            const date = new Date(value); 
          }
          else {
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "اختر تاريخ الميلاد";
          }
        } catch {
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "تاريخ غير صالح";
        }
      }

      //city, street
      else if (['city', 'street'].includes(name)){
        if (value === "") {
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "هذا الحقل مطلوب";
        } 
        else{
          tag?.style.setProperty('border', '2px solid green'); // ملاحظة عربية
          return ""
        }
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
    if (photoPick.busy) { toast.warn(PHOTO_NOT_READY); return; }
    let b = await validate();
    if (b) { toast.warn(b); return; }
    b = true
    const ff = ['tz', 'firstname', 'lastname', 'birth_date', 'gender', 'city', 'street', 'school', 'layer', 'health_status'];
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
    if(!b) return toast.warn("يُرجى تعبئة الحقول المطلوبة");
    e.preventDefault();
    try {
      setSaving(true);
      setErr(null);

      const payload = { ...form };
      if (parent) {
        const res = await submitFromParent(registrationToken, payload, photo);
        if (!res.ok) {
          if (res.code === "INTAKE_CLOSED") {
            setInviteStatus({ checking: false, valid: true, open: false });
            return;
          }
          throw new Error(res.code === "RATE_LIMITED" ? "تجاوزتم عدد الطلبات المسموح به. يُرجى المحاولة بعد ساعة." : res.message);
        }
        setSubmitted(true);
        return;
      }
      
      // The photo only changes through its own endpoints, which keep the
      // stored link and the Drive file in sync, and only when the admin
      // actually picked a new file or removed it.
      delete payload.photo;
      const photoChange = photoAction(originalPhoto, photo);

      const res = isEdit ? await update(form.tz, withBaseVersion(payload, opened)): await create({...payload});
      if(!res) return;
      if(!res.ok) {
        if (handleSaveError(res, { draft: [form.health_status, form.notes].filter(Boolean).join("\n"), setNotice, onReload: load })) return;
        throw new Error(res.message);
      }
      setNotice(null);
      toast.success(isEdit ? "تم حفظ بيانات الطالب بنجاح" : "تمت إضافة الطالب بنجاح");

      if (photoChange === "remove") {
        await handleDeletePhotoWithSave();
      }
      if (photoChange === "upload") {
        const res2 = await uploadPhoto(form.tz, photo);
        if(!res2) return;
        if(!res2.ok) {
          toast.warn("تعذّر رفع صورة الطالب: " + res2.message);
        }
        else{
          toast.success("تم رفع صورة الطالب بنجاح");
        }
      }
      navigate(-1);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "تعذّر إتمام العملية");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePhotoWithSave = async () => {
    try {
        const res = await deletePhoto(form.tz);
        if (!res || !res.ok) throw new Error(res?.message || "تعذّر حذف الصورة");
        setPhoto(null);
        toast.success("تم حذف الصورة بنجاح");
        return true;
    } catch (e) {
        toast.error(e.message || "تعذّر حذف الصورة");
        return false;
    }
};

  // ملاحظة عربية
  const handleHardDelete = async () => {
    if (!isEdit) return;
    try {
      const res = await deleteS(form.tz);
      if(!res) return;
      if(!res.ok) throw new Error(res.message);

      toast.success("تم الحذف بنجاح");
      navigate(-1);
    } catch (e) {
      toast.error(e.message || "تعذّر إتمام العملية");
    }
  };
  // ملاحظة عربية
  if (parent) {
    if (inviteStatus.checking) {
      return (
        <div className={styles.formContainer}>
          جارٍ التحقق من صلاحية رابط التسجيل…
        </div>
      );
    }
    if (!inviteStatus.valid) {
      return (
        <div className={styles.formContainer} style={{ color: "#b91c1c", textAlign: "center" }}>
          <h2>الرابط غير صالح</h2>
          <p>يُرجى طلب رابط جديد من الجمعية.</p>
        </div>
      );
    }
    if (!inviteStatus.open) {
      return (
        <div className={styles.formContainer} style={{ textAlign: "center" }}>
          <h2>استقبال الطلبات متوقف مؤقتًا</h2>
          <p>يُرجى المحاولة مرة أخرى بعد بضعة أيام.</p>
        </div>
      );
    }
    if (submitted) {
      return (
        <div className={styles.formContainer} style={{ textAlign: "center" }}>
          <h2>تم استلام الطلب</h2>
          <p>سنتواصل معكم قريبًا.</p>
        </div>
      );
    }
  }

  if (loading) return <div className={styles.formContainer}>جارٍ تحميل البيانات…</div>;
  if (err)      return <div className={styles.formContainer} style={{color:"#b91c1c"}}>{err}</div>;
  if (lock.status === "blocked") {
    return <LockedScreen holder={lock.holder} onForceRelease={forceRelease(lockKey)} />;
  }
  // Nothing is editable until the lock is resolved.
  if (lock.status === "loading") return <div className={styles.formContainer} role="status">جارٍ تحميل البيانات…{recovery.element}</div>;

  return (
    <div className={styles.formContainer}>
      <h2 style={{textAlign: "center"}}>{parent ? "طلب تسجيل طالب" : isEdit ? "تعديل بيانات الطالب" : "إضافة طالب جديد"}</h2>

      <SaveNotice notice={notice} />
      {recovery.element}
      <ReadOnlyArea readonly={readonly} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <fieldset className={sectionStyles.formSection} data-tour="student-details">
        <legend>بيانات الطالب</legend>
        <label>رقم الهوية: <span style={{color: "red"}}>*</span></label>
        <input name="tz" data-tour="student-tz" value={form.tz} onChange={onField} readOnly={!isNew} />
        {error.tz != "" && <label style={{color: "red"}}>{error.tz}</label>}

        <label>الاسم الشخصي: <span style={{color: "red"}}>*</span></label>
        <input name="firstname" data-tour="student-firstname" value={form.firstname} onChange={handleChange} required />
        {error.firstname != "" && <label style={{color: "red"}}>{error.firstname}</label>}

        <label>اسم العائلة: <span style={{color: "red"}}>*</span></label>
        <input name="lastname" data-tour="student-lastname" value={form.lastname} onChange={handleChange} required />
        {error.lastname != "" && <label style={{color: "red"}}>{error.lastname}</label>}

        <label>تاريخ الميلاد: <span style={{color: "red"}}>*</span></label>
        <input
          name="birth_date"
          data-tour="student-birth-date"
          type="date"
          value={form.birth_date ? String(form.birth_date).slice(0, 10) : ''}
          onChange={onField}
        />
        {error.birth_date != "" && <label style={{color: "red"}}>{error.birth_date}</label>}

        <label>الجنس: <span style={{color: "red"}}>*</span></label>
        <select name="gender" data-tour="student-gender" value={form.gender} onChange={onField}>
          <option value="">اختر الجنس</option>
          <option value="ذكر">ذكر</option>
          <option value="انثى">أنثى</option>
        </select>
        {error.gender != "" && <label style={{color: "red"}}>{error.gender}</label>}
      </fieldset>

      <fieldset className={sectionStyles.formSection}>
        <legend>السكن والتواصل</legend>
        <label>مدينة السكن: <span style={{color: "red"}}>*</span></label>
        <input name="city" value={form.city} onChange={onField} />
        {error.city != "" && <label style={{color: "red"}}>{error.city}</label>}

        <label>شارع السكن: <span style={{color: "red"}}>*</span></label>
        <input name="street" data-tour="student-street" value={form.street} onChange={onField} />
        {error.street != "" && <label style={{color: "red"}}>{error.street}</label>}

        <label>الهاتف:</label>
        <input
          name="phone"
          value={displayPhoneLocal(form.phone)}
          onChange={(e)=>onPhoneChange('phone', e.target.value)}
          placeholder="052-123-4567"
        />
        {error.phone != "" && <label style={{color: "red"}}>{error.phone}</label>}

        <label>البريد الإلكتروني:</label>
        <input name="email" value={form.email} onChange={onField} />
        {error.email !="" && <label style={{color: "red"}}>{error.email}</label>}
      </fieldset>

      <fieldset className={sectionStyles.formSection} data-tour="student-study">
        <legend>الدراسة</legend>
        <label>المدرسة: <span style={{color: "red"}}>*</span></label>
        <input name="school" data-tour="student-school" value={form.school} onChange={handleChange} required />
        {error.school != "" && <label style={{color: "red"}}>{error.school}</label>}

        <label>الصف: <span style={{color: "red"}}>*</span></label>
        <input name="layer" data-tour="student-layer" value={form.layer} onChange={handleChange} required />
        {error.layer != "" && <label style={{color: "red"}}>{error.layer}</label>}

        {!parent && canAssignGuide && instructors.length > 0 && <>
          <label>{t("roster.responsibleGuide")}:</label>
          <select
            name="main_teacher"
            value={form.main_teacher || ""}
            onChange={handleChange}
          >
            <option value="">{t("roster.chooseInstructor")}</option>
            {/* A stored guide who is no longer listed (inactive) still shows. */}
            {responsibleGuideOptions(instructors, form.main_teacher).map((o) => (
              <option key={o.value} value={o.value}>
                {o.inactive ? t("roster.inactiveGuide") : o.label}
              </option>
            ))}
          </select>
        </>}
      </fieldset>

      <fieldset className={sectionStyles.formSection} data-tour="student-parents">
        <legend>الأهل <span className={sectionStyles.optionalTag}>اختياري</span></legend>
        <label>الأب:</label>
        <div className={sectionStyles.parentRow}>
          <input name="father_name" value={form.father_name} onChange={handleChange} placeholder="اسم الأب" />
          <input
            name="father_phone"
            value={displayPhoneLocal(form.father_phone)}
            onChange={(e) => onPhoneChange('father_phone', e.target.value)}
            placeholder="052-123-4567"
          />
          <input name="father_work" value={form.father_work} onChange={handleChange} placeholder="عمل الأب" />
        </div>

        <label>الأم:</label>
        <div className={sectionStyles.parentRow}>
          <input name="mother_name" value={form.mother_name} onChange={handleChange} placeholder="اسم الأم" />
          <input
            name="mother_phone"
            value={displayPhoneLocal(form.mother_phone)}
            onChange={(e) => onPhoneChange('mother_phone', e.target.value)}
            placeholder="052-123-4567"
          />
          <input name="mother_work" value={form.mother_work} onChange={handleChange} placeholder="عمل الأم" />
        </div>
      </fieldset>

      <fieldset className={sectionStyles.formSection} data-tour="student-health">
        <legend>الصحة والملاحظات</legend>
        <label>الحالة الصحية: <span style={{color: "red"}}>*</span></label>
        <textarea name="health_status" rows={4} value={form.health_status || ""} onChange={handleChange} required />
        {error.health_status != "" && <label style={{color: "red"}}>{error.health_status}</label>}

        <label>ملاحظات:</label>
        <textarea name="notes" rows={4} value={form.notes || ""} onChange={handleChange} />
        {error.notes != "" && <label style={{color: "red"}}>{error.notes}</label>}
      </fieldset>

      
      <div style={{ marginBottom: "16px" }}>
        <label>صورة الطالب:</label>
        <button onClick={
          ()=> {
            const input = document.createElement('input');
            input.type = "file";
            input.accept = "image/*"
            input.onchange = handlePhoto;
            input.click();
          }
        }> {photo ? "تغيير الصورة" : "اختر صورة"} </button>
        {photo && <button style={{marginLeft: "18px", backgroundColor: "red"}} onClick={() => { photoPick.cancel(); setPhoto(null); }}>إزالة الصورة</button>}
        <br />

        {/* معاينة الصورة إذا موجودة */}
        {photo && (
          <img
            src={photo instanceof File ? URL.createObjectURL(photo) : passportSrc(photo)}
            alt="preview"
            style={PASSPORT_PREVIEW}
          />
        )}
      </div>
      </ReadOnlyArea>

      <div className={styles.buttonRow} style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="submit" data-tour="student-save" onClick={handleSubmit} disabled={readonly} style={{width:"100%"}}>
          {saving ? "جارٍ الحفظ…" : parent ? "إرسال الطلب" : (isEdit ? "حفظ التعديلات" : "إضافة الطالب")}
        </button>

        {isEdit && !parent && (
          <center>
            <button type="button" data-tour="student-delete" style={{ background: "#7f1d1d", width: "100%" }} onClick={handleHardDelete} disabled={readonly}>
              حذف
            </button>
          </center>
        )}

        {!parent && (<button type="button" data-tour="student-back" style={{ background: "#6b7280", width: "100%" }} onClick={() => navigate(-1)}>
          العودة إلى القائمة
        </button>)}
      </div>
      {/* Students are audited by _id (older rows by tz). */}
      {/* {isEdit && !parent && canStored("audit.view") && <RecentChanges targetIds={[form._id, form.tz]} />} */}
    </div>
  );
};

export default EditStudent;
