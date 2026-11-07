import { formatDateTime } from "../../generated/dateFormat";
import RequiredMark from "../UI/RequiredMark";
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
// ملاحظة عربية
import { create, update, getUserById as getOne, uploadPhoto, deletePhoto, changeUserRole } from "../../WebServer/services/user/functionsUser.jsx";
import styles from "./User.module.css";
import sectionStyles from "../UI/FormSection.module.css";
import { toast } from "../../ALERT/SystemToasts.jsx";
import EyeIcon from "../UI/EyeIcon";
import { photoAction } from "../../utils/photoChange";
import { passportSrc, PASSPORT_PREVIEW } from "../../utils/passportPhoto";
import { usePhotoPick, PHOTO_NOT_READY } from "../../utils/photoPick";
import { useI18n } from "../../i18n/I18nContext";
import { canStored, getStoredUserId, getStoredViewer } from "../../utils/session";
import { ROLE_LABEL_KEY, canEditDetailsClient, canManageTargetClient, isDemotion, resolveRole } from "../../utils/roles";
import { requiredUserFields } from "../../utils/userFormFields";
import { ask } from "../Provides/confirmBus";
import StatusBadge from "../UI/StatusBadge.jsx";
import { fillText } from "../../utils/vehicleDisplay";
import { permissionError, viewerAssignableRoles } from "./RolePickerDialog.jsx";
import tabStyles from "./PermissionsTab.module.css";
import ChangeOwnPassword from "../Profile/ChangeOwnPassword.jsx";
import { isValidIsraeliId } from "../../utils/israeliId";
import { resetUserTours } from "../../WebServer/services/tours/functionsTours.jsx";
import useItemLock from "../../locks/useItemLock";
import LockedScreen from "../../locks/LockedScreen";
import ReadOnlyArea from "../../locks/ReadOnlyArea";
import SaveNotice from "../../locks/SaveNotice";
import useReloadOnUnblock from "../../locks/useReloadOnUnblock";
import { handleSaveError, withBaseVersion } from "../../locks/staleSave";
import { useLockRecovery } from "../../locks/LockLostBanner";

const safeAsk = async (options) => {
  try { return await ask("change", options); } catch { return false; }
};

const OPTIONAL_USER_FIELDS = ["birth_date", "gender", "email", "city", "street"];

const EditUser = () => {
  const { t } = useI18n();
  const params = useParams();              // "new" الأحدالجمعة _id
  const navigate = useNavigate();

  const id = params.id;
  const isEdit = id !== "new";
  const isNew = !isEdit;

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
    roles: [],
    photo: null,
  });

  const [photo, setPhoto] = useState(null);
  // The photo link stored on the server when the page loaded; saving only
  // touches it when a new file was picked or the photo was removed.
  const [originalPhoto, setOriginalPhoto] = useState(null);
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
    roles: [],
  })

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  // The role changes through its own endpoint, not the form.
  const [currentRole, setCurrentRole] = useState(null);
  const [roleChoice, setRoleChoice] = useState("");
  const [savingRole, setSavingRole] = useState(false);
  const [resettingTours, setResettingTours] = useState(false);
  // The user as opened: its updatedAt is the baseVersion of the save. Users
  // are opened by ID number, but the lock is on the stored _id.
  const [opened, setOpened] = useState(null);
  const [notice, setNotice] = useState(null);

  const isSelf = isEdit && Boolean(form._id) && String(form._id) === String(getStoredUserId());
  const canChangeRole = canStored("users.changeRole");
  // Actions on another user need authority over him (never oneself); hides UI
  // only, the server decides.
  const canManage = isEdit && canManageTargetClient(getStoredViewer(), form);
  // Another user's password: only a users.resetPassword holder, for a user he
  // manages (lower rank, never an IT user). The value is never shown, only
  // typed. One's own password changes only through ChangeOwnPassword
  // (current password required); the server ignores it in a self edit.
  const showPasswordField = isNew || (!isSelf && canManage && canStored("users.resetPassword"));
  // Another user's email (where a password reset is sent) follows the same
  // rule; the server drops it otherwise.
  const canEditEmail = isNew || isSelf || (canManage && canStored("users.resetPassword"));
  // Editing someone one may not manage is refused; the page is then read-only.
  // An IT user below the viewer: his personal details only (no password,
  // email or role: those follow canManage above).
  const detailsOnly = isEdit && !isSelf && !canManage && canEditDetailsClient(getStoredViewer(), form);
  const canSubmit = !isEdit || isSelf || canManage || detailsOnly;
  const lockKey = isEdit && opened?._id ? `user:${opened._id}` : null;
  const lock = useItemLock(lockKey, { enabled: canSubmit });
  const readonly = lock.status === "readonly";
  // Roles below the viewer's own (all for the system account); the server
  // applies the same rule to approvals, new accounts and role changes.
  const viewerRoles = viewerAssignableRoles();
  const newUserRoles = canStored("users.create") ? viewerRoles : [];

  const load = async () => {
    try {
      //console.log("load training");
      setLoading(true);
      setErr(null);
      const res = await getOne(id); // ملاحظة عربية
      if(!res.ok) throw new Error(res.message);
      if (res) {
        const s = res.user;
        const role = resolveRole(s);
        s.roles = role ? [role] : [];
        setCurrentRole(role);
        setRoleChoice(role || "");
        setForm(s);
        setPhoto(s.photo || null);
        setOriginalPhoto(s.photo || null);
        setOpened(s);
      } else {
        setErr("المستخدم غير موجود");
      }
      setPasswordTouched(false); // ملاحظة عربية
    } catch (e) {
      setErr("تعذّر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isEdit) return;
    load();
  }, [id, isEdit]);

  useReloadOnUnblock(lock.status, load);
  const recovery = useLockRecovery(lock, { reload: load, draft: [form.firstname, form.lastname].filter(Boolean).join(" ") });

  // A role change bumps the user's version. The form's
  // next save builds on the new one (else it would be refused as stale and
  // name the user himself); the typed fields are left as they are.
  const refreshBase = async () => {
    const res = await getOne(id);
    if (res?.ok && res.user) setOpened((prev) => (prev ? { ...prev, updatedAt: res.user.updatedAt } : res.user));
  };

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
    // Left empty, these do not block saving (requiredUserFields): no "required" message.
    if (OPTIONAL_USER_FIELDS.includes(name) && !value) {
      document.getElementsByName(name)[0]?.style.removeProperty('border');
      return "";
    }
    const tag = document.getElementsByName(name)[0];
    if(name === "tz"){
      //console.log(isNew && value === "");
        if (value === "") {
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "هذا الحقل مطلوب";
        } 
        else if(!isValidIsraeliId(value)){
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "رقم الهوية غير صالح"
        }
        else if(isNew) {
          const data = await getOne(value)
          if(data.ok){
            tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
            return "رقم الهوية مسجّل مسبقًا في النظام"
          } 
        }
        tag?.style.setProperty('border', '2px solid green'); // ملاحظة عربية
        return ""
      }

      //fisrtname, lastname
      else if(['firstname', 'lastname', 'father_name', 'mother_name'].includes(name)){
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
      else if(['gender', 'roles'].includes(name)){
        if (name === 'gender' && !['ذكر' , 'انثى'].includes(value)) {
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "اختر الجنس";
        } else if (isNew && name === 'role' && !['ادارة', 'مرشد', 'مساعد'].includes(value)) {
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
          return "هذا الحقل مطلوب";
        } 
        else{
          tag?.style.setProperty('border', '2px solid green'); // ملاحظة عربية
          return ""
        }
      }
      else if (name === "roles") {
        if (!value || value.length === 0) return "اختر دورًا واحدًا على الأقل";
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
    
    // ملاحظة عربية
    if (name === 'password') setPasswordTouched(true);

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
    if (photoPick.busy) { toast.warn(PHOTO_NOT_READY); return; }
    let b = await validate();
    if (b) { toast.warn(b); return; }
    b = true
    // A read-only email (no users.passwords) is not sent, so it is not required.
    const ff = requiredUserFields();
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
    // A new user needs a role and a first password.
    if (isNew && (!form.roles?.[0] || !form.password?.trim())) b = false;
    if(!b) return toast.warn("يُرجى تعبئة الحقول المطلوبة");
    e.preventDefault();
    try {
      setSaving(true);
      setErr(null);

      const payload = { ...form };
      
      console.log("isEdit", isEdit);
      // ملاحظة عربية
      if (isSelf || !passwordTouched || !form.password?.trim()) {
        delete payload.password;
      }
      if (!canEditEmail) delete payload.email;
      // The photo only changes through its own endpoints, which keep the
      // stored link and the Drive file in sync.
      delete payload.photo;
      // The role has its own endpoint (PUT /:tz/role); the server ignores it here. A new account
      // gets its role on creation only when the creator may assign roles.
      for (const field of ["role", "vehiclePermissions", "permissionGrants", "permissionRevokes", "permissions", "lockedAt", "failedLoginCount"]) {
        delete payload[field];
      }
      if (isEdit || !newUserRoles.includes(payload.roles?.[0])) delete payload.roles;
      const photoChange = photoAction(originalPhoto, photo);

      const res = isEdit ? await update(form.tz, withBaseVersion(payload, opened)): await create({...payload});
      if(!res) return;
      if(!res.ok) {
        if (handleSaveError(res, { draft: [form.firstname, form.lastname].filter(Boolean).join(" "), setNotice, onReload: load })) return;
        throw new Error(res.message);
      }
      toast.success(isEdit ? "تم حفظ بيانات المستخدم بنجاح" : "تمت إضافة المستخدم بنجاح");

      if (photoChange === "remove") {
        const res2 = await deletePhoto(form.tz);
        if(!res2) return;
        if(!res2.ok) {
          toast.warn("تعذّر حذف صورة المستخدم: " + res2.message);
        }
        else{
          toast.success("تم حذف صورة المستخدم بنجاح");
        }
      }
      if (photoChange === "upload") {
        const res2 = await uploadPhoto(form.tz, photo);
        if(!res2) return;
        if(!res2.ok) {
          toast.warn("تعذّر رفع صورة المستخدم: " + res2.message);
        }
        else{
          toast.success("تم رفع صورة المستخدم بنجاح");
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


  // PUT /:tz/role. A demotion clears the user's grants and revokes, so it is
  // confirmed first.
  const handleSaveRole = async () => {
    if (!roleChoice || roleChoice === currentRole) return toast.info(t("perms.roleUnchanged"));
    if (isDemotion(currentRole, roleChoice)) {
      const ok = await safeAsk({ title: t("perms.demoteTitle"), message: t("perms.demoteWarning"), confirmText: t("perms.confirm"), cancelText: t("perms.cancel") });
      if (!ok) return;
    }
    setSavingRole(true);
    const res = await changeUserRole(form.tz, roleChoice);
    setSavingRole(false);
    if (!res.ok) return toast.warn(permissionError(t, res));
    await refreshBase();
    setCurrentRole(roleChoice);
    setForm((prev) => ({ ...prev, role: roleChoice, roles: [roleChoice] }));
    toast.success(t("perms.roleSaved"));
    navigate(-1);
  };

  // POST /tours/reset/:tz: clears every tour id, so the guided journey is offered again at the next sign-in.
  const handleResetTours = async () => {
    setResettingTours(true);
    const res = await resetUserTours(form.tz);
    setResettingTours(false);
    if (!res.ok) return toast.warn(t("tour.userStatus.resetFailed"));
    setForm((prev) => ({ ...prev, tourSummary: { intro: "none", done: 0, skipped: 0 } }));
    toast.success(t("tour.userStatus.resetDone"));
  };

  if (loading) return <div className={styles.formContainer}>جارٍ تحميل البيانات…</div>;
  if (err)      return <div className={styles.formContainer} style={{color:"#b91c1c"}}>{err}</div>;
  if (lock.status === "blocked") {
    return <LockedScreen holder={lock.holder} />;
  }
  // Nothing is editable until the lock is resolved.
  if (lock.status === "loading") return <div className={styles.formContainer} role="status">جارٍ تحميل البيانات…{recovery.element}</div>;

  return (
    <div className={styles.formContainer}>
      <center><h1>{isEdit ? "تعديل بيانات المستخدم" : "إضافة مستخدم جديد"}</h1></center>
      <SaveNotice notice={notice} />
      {detailsOnly && <p className="alert alert-info" role="note">{t("record.itDetailsOnly")}</p>}
      {recovery.element}

      <ReadOnlyArea readonly={readonly} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <fieldset className={sectionStyles.formSection} data-tour="user-account">
        <legend>بيانات الحساب</legend>
        <label>رقم الهوية:<span style={{color: "red"}}>*</span></label>
        <input name="tz" value={form.tz} onChange={onField} readOnly={!isNew} />
        <label style={{color: "red"}}>{error.tz}</label>

        {showPasswordField && (<>
        <label>كلمة المرور:{isNew && <RequiredMark />}</label>
        <div className={styles.passwordWrapper}>
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={form.password || ''}
            onChange={onField}
            placeholder={isNew ? '' : '*******'}
          />
          <button
            type="button"
            className={styles.togglePassword}
            onClick={() => setShowPassword((value) => !value)}
            title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            aria-pressed={showPassword}
          >
            <EyeIcon open={showPassword} />
          </button>

        </div>
        <label style={{color: "red"}}>{error.password}</label>
        </>)}

        {isSelf && <ChangeOwnPassword />}

        {isNew && newUserRoles.length > 0 && (
          <>
            <label>{t("perms.role")}:<RequiredMark /></label>
            <select
              name="roles"
              value={form.roles?.[0] || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, roles: e.target.value ? [e.target.value] : [] }))}
            >
              <option value="" disabled>{t("perms.role")}</option>
              {newUserRoles.map((r) => <option key={r} value={r}>{t(ROLE_LABEL_KEY[r], r)}</option>)}
            </select>
          </>
        )}

        {isEdit && (
          <div className={tabStyles.roleRow} data-tour="user-role">
            <label htmlFor="user-role">{t("perms.role")}:</label>
            {canChangeRole && canManage ? (
              <>
                <select id="user-role" data-tour="user-role-select" value={roleChoice} onChange={(e) => setRoleChoice(e.target.value)}>
                  {!currentRole && <option value="">{t("perms.noRole")}</option>}
                  {/* The current role always shows, even when it is not one the viewer may give. */}
                  {currentRole && !viewerRoles.includes(currentRole) && (
                    <option value={currentRole} disabled>{t(ROLE_LABEL_KEY[currentRole], currentRole)}</option>
                  )}
                  {viewerRoles.map((r) => <option key={r} value={r}>{t(ROLE_LABEL_KEY[r], r)}</option>)}
                </select>
                <button type="button" data-tour="user-role-save" onClick={handleSaveRole} disabled={savingRole || !roleChoice || roleChoice === currentRole}>
                  {t("perms.saveRole")}
                </button>
              </>
            ) : (
              <span id="user-role">{currentRole ? t(ROLE_LABEL_KEY[currentRole], currentRole) : t("perms.noRole")}</span>
            )}
          </div>
        )}

        {isEdit && form.lockedAt && (
          <div className={tabStyles.lockRow}>
            <StatusBadge tone="danger">{t("perms.locked")}</StatusBadge>
            <small>{fillText(t("perms.lockedSince"), { when: formatDateTime(form.lockedAt) })}</small>
          </div>
        )}
      </fieldset>

      <fieldset className={sectionStyles.formSection} data-tour="user-personal">
        <legend>البيانات الشخصية</legend>
        <label>الاسم الشخصي:<span style={{color: "red"}}>*</span></label>
        <input name="firstname" value={form.firstname} onChange={handleChange} required />
        <label style={{color: "red"}}>{error.firstname}</label>

        <label>اسم العائلة:<span style={{color: "red"}}>*</span></label>
        <input name="lastname" value={form.lastname} onChange={handleChange} required />
        <label style={{color: "red"}}>{error.lastname}</label>

        <label>تاريخ الميلاد:</label>
        <input
          name="birth_date"
          type="date"
          value={form.birth_date ? String(form.birth_date).slice(0, 10) : ''}
          onChange={onField}
        />
        <label style={{color: "red"}}>{error.birth_date}</label>

        <label>الجنس:</label>
        <select name="gender" value={form.gender} onChange={onField}>
          <option value="">اختر الجنس</option>
          <option value="ذكر">ذكر</option>
          <option value="انثى">أنثى</option>
        </select>
        <label style={{color: "red"}}>{error.gender}</label>
      </fieldset>

      <fieldset className={sectionStyles.formSection}>
        <legend>السكن والتواصل</legend>
        <label>مدينة السكن:</label>
        <input name="city" value={form.city} onChange={onField} />
        <label style={{color: "red"}}>{error.city}</label>

        <label>شارع السكن:</label>
        <input name="street" value={form.street} onChange={onField} />
        <label style={{color: "red"}}>{error.street}</label>

        <label>الهاتف:<span style={{color: "red"}}>*</span></label>
        <input
          name="phone"
          value={displayPhoneLocal(form.phone)}
          onChange={(e)=>onPhoneChange('phone', e.target.value)}
          placeholder="052-123-4567"
        />
        <label style={{color: "red"}}>{error.phone}</label>

        <label>البريد الإلكتروني:</label>
        <input name="email" value={form.email} onChange={onField} readOnly={!canEditEmail} />
        <label style={{color: "red"}}>{error.email}</label>
        {isNew && <small>بدون بريد إلكتروني لن يصل رمز «نسيت كلمة المرور»، ويعيّنها المدير.</small>}
      </fieldset>

      {/* Sent by the server only to a users.edit holder who manages this user. */}
      {form.tourSummary && (
        <fieldset className={sectionStyles.formSection} data-tour="user-tour-status">
          <legend>{t("tour.userStatus.title")}</legend>
          <p>{t("tour.userStatus.intro")} <strong>{t(`tour.userStatus.status.${form.tourSummary.intro}`, form.tourSummary.intro)}</strong></p>
          <p>{fillText(t("tour.userStatus.chapters"), { done: form.tourSummary.done ?? 0, skipped: form.tourSummary.skipped ?? 0 })}</p>
          <button type="button" onClick={handleResetTours} disabled={resettingTours}>{t("tour.userStatus.reset")}</button>
        </fieldset>
      )}

      <div style={{ marginBottom: "16px" }}>
        <label>صورة المستخدم:</label>
        <button onClick={
          ()=> {
            const input = document.createElement('input');
            input.type = "file";
            input.accept = "image/*"
            input.onchange = handlePhoto;
            input.click();
          }
        }> {photo ? "تغيير الصورة" : "اختر صورة"} </button>
        {photo && (
          <button type="button" onClick={() => { photoPick.cancel(); setPhoto(null); }} style={{ marginInlineStart: "8px" }}>
            حذف الصورة
          </button>
        )}
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
        {canSubmit && (
          <button type="submit" data-tour="user-save" onClick={handleSubmit} disabled={readonly} style={{width:"100%"}}>
            {saving ? "جارٍ الحفظ…" : (isEdit ? "حفظ التعديلات" : "إضافة المستخدم")}
          </button>
        )}
        {/* Suspending and deleting are on the user's page (owner, 2026-11-02). */}
        <br/>
        {(<button type="button" style={{ background: "#6b7280", width: "100%" }} onClick={() => navigate(-1)}>
          العودة إلى القائمة
        </button>)}
      </div>

    </div>
  );
};

export default EditUser;
