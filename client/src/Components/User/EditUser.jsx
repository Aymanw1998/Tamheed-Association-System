import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
// ملاحظة عربية
import { create, update, getUserById as getOne, /*softDelete,*/ deleteU, uploadPhoto, deletePhoto, changeStatus, viewPassword, changeUserRole, unlockUser } from "../../WebServer/services/user/functionsUser.jsx";
import styles from "./User.module.css";
import sectionStyles from "../UI/FormSection.module.css";
import { toast } from "../../ALERT/SystemToasts.jsx";
import EyeIcon from "../UI/EyeIcon";
import { photoAction } from "../../utils/photoChange";
import { useI18n } from "../../i18n/I18nContext";
import { canStored, getStoredUserId, getStoredViewer } from "../../utils/session";
import { ROLE_LABEL_KEY, canManageTargetClient, isDemotion, resolveRole } from "../../utils/roles";
import { ask } from "../Provides/confirmBus";
import StatusBadge from "../UI/StatusBadge.jsx";
import { fillText } from "../../utils/vehicleDisplay";
import PermissionsTab from "./PermissionsTab.jsx";
import { permissionError, viewerAssignableRoles } from "./RolePickerDialog.jsx";
import RecentChanges from "../Audit/RecentChanges.jsx";
import tabStyles from "./PermissionsTab.module.css";
import ChangeOwnPassword from "../Profile/ChangeOwnPassword.jsx";
import { isValidIsraeliId } from "../../utils/israeliId";

const safeAsk = async (options) => {
  try { return await ask("change", options); } catch { return false; }
};

const EditUser = () => {
  const { t, language } = useI18n();
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
  const [fetchingPassword, setFetchingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  // Role and permissions change through their own endpoints, not the form.
  const [currentRole, setCurrentRole] = useState(null);
  const [roleChoice, setRoleChoice] = useState("");
  const [savingRole, setSavingRole] = useState(false);
  const [tab, setTab] = useState("details");
  const [tabKey, setTabKey] = useState(0);
  const [unlocking, setUnlocking] = useState(false);

  const isSelf = isEdit && Boolean(form._id) && String(form._id) === String(getStoredUserId());
  const canChangeRole = canStored("users.changeRole");
  const canManagePermissions = canStored("permissions.manage");
  // Actions on another user need authority over him (never oneself); hides UI
  // only, the server decides.
  const canManage = isEdit && canManageTargetClient(getStoredViewer(), form);
  // Another user's password: only the system or a users.passwords holder.
  // One's own password changes only through ChangeOwnPassword (current
  // password required); the server ignores it in a self edit.
  const showPasswordField = isNew || (!isSelf && canStored("users.passwords"));
  // Another user's email (where a password reset is sent) follows the same
  // rule; the server drops it otherwise.
  const canEditEmail = isNew || isSelf || canStored("users.passwords");
  // Editing someone one may not manage is refused; the page is then read-only.
  const canSubmit = !isEdit || isSelf || canManage;
  const showTabs = isEdit && canManagePermissions;
  // Roles below the viewer's own (all for the system account); the server
  // applies the same rule to approvals, new accounts and role changes.
  const viewerRoles = viewerAssignableRoles();
  const newUserRoles = canStored("users.create") ? viewerRoles : [];

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
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
        } else {
          setErr("المستخدم غير موجود");
        }
        setPasswordTouched(false); // ملاحظة عربية
      } catch (e) {
        setErr("خلل في جلب البيانات");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

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
    const tag = document.getElementsByName(name)[0];
    if(name === "tz"){
      //console.log(isNew && value === "");
        if (value === "") {
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "املأ الحقل";
        } 
        else if(!isValidIsraeliId(value)){
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "رقم الهوية غير صالح"
        }
        else if(isNew) {
          const data = await getOne(value)
          if(data.ok){
            tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
            return "رقم الهوية موجود في النظام"
          } 
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

    const handleFetchPassword = async () => {
  if (isNew) return;

  try {
    setFetchingPassword(true);

    // ملاحظة عربية
    const tzToFetch = String(form.tz || id).trim();
    if (!tzToFetch) return;

    const res = await viewPassword(tzToFetch);

    // bcrypt / cannot view
    if (!res?.ok) {
      toast.warn(res?.message || 'لا يمكن عرض كلمة المرور لهذا المستخدم');
      return;
    }

    // The server only reports whether a password is set, never its value.
    setShowPassword(false);
    setForm((prev) => ({ ...prev, password: '' }));
    toast.info(res.hasPassword ? 'كلمة المرور محددة (لا يمكن عرضها). أدخل كلمة مرور جديدة لتغييرها.' : 'لم يتم تحديد كلمة مرور لهذا المستخدم');
  } catch (e) {
    console.error(e);
    toast.error('❌ خطأ في جلب كلمة المرور');
  } finally {
    setFetchingPassword(false);
  }
};

  const handleSubmit = async (e) => {
    let b = await validate();
    if (b) { toast.warn(b); return; }
    b = true
    // A read-only email (no users.passwords) is not sent, so it is not required.
    const ff = ['tz', 'firstname', 'lastname', 'birth_date', 'gender', 'phone', 'email', 'city', 'street']
      .filter((name) => name !== 'email' || canEditEmail);
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
      
      console.log("isEdit", isEdit);
      // ملاحظة عربية
      if (isSelf || !passwordTouched || !form.password?.trim()) {
        delete payload.password;
      }
      if (!canEditEmail) delete payload.email;
      // The photo only changes through its own endpoints, which keep the
      // stored link and the Drive file in sync.
      delete payload.photo;
      // Role and permissions have their own endpoints (PUT /:tz/role and
      // PUT /:tz/permissions); the server ignores them here. A new account
      // gets its role on creation only when the creator may assign roles.
      for (const field of ["role", "vehiclePermissions", "permissionGrants", "permissionRevokes", "permissions", "lockedAt", "failedLoginCount"]) {
        delete payload[field];
      }
      if (isEdit || !newUserRoles.includes(payload.roles?.[0])) delete payload.roles;
      const photoChange = photoAction(originalPhoto, photo);

      const res = isEdit ? await update(form.tz, payload): await create({...payload});
      if(!res) return;
      if(!res.ok) throw new Error(res.message);
      toast.success(`✅ المستخدم ${isEdit ? 'حُديث' : 'حُفِظ'} بنجاح`);

      if (photoChange === "remove") {
        const res2 = await deletePhoto(form.tz);
        if(!res2) return;
        if(!res2.ok) {
          toast.warn("لم يتم حذف صورة المستخدم: " + res2.message);
        }
        else{
          toast.success("✅ تم حذف صورة المستخدم بنجاح");
        }
      }
      if (photoChange === "upload") {
        const res2 = await uploadPhoto(form.tz, photo);
        if(!res2) return;
        if(!res2.ok) {
          toast.warn("لم يتم تحميل صورة المستخدم: " + res2.message);
        }
        else{
          toast.success("✅ تم تحميل صورة المستخدم بنجاح");
        }
      }
      navigate(-1);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "❌ فشل العملية");
    } finally {
      setSaving(false);
    }
  };

  // ملاحظة عربية
  const handleHardDelete = async () => {
    if (!isEdit) return;
    try {
      const res = await deleteU(form.tz);
      if(!res) return;
      if(!res.ok) throw new Error(res.message);

      toast.success("✅ تم الحذف بنجاح");
      navigate(-1);
    } catch (e) {
      toast.error(e.message || "❌ فشل العملية");
    }
  };

  const sendToRoomNoActive = async () => {
    if (!isEdit) return;
    try {
      const res = await changeStatus(form.tz, "active", "noActive");
      if(!res) return;
      if(!res.ok) throw new Error(res.message);

      toast.success("✅ تم غلق الحساب بنجاح");
      navigate(-1);
    } catch (e) {
      toast.error(e.message || "❌ فشل العملية");
    }
  }

  // PUT /:tz/role. A demotion clears the user's grants and revokes, so it is
  // confirmed first; afterwards the manager may go straight to the tab.
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
    setCurrentRole(roleChoice);
    setForm((prev) => ({ ...prev, role: roleChoice, roles: [roleChoice] }));
    toast.success(t("perms.roleSaved"));
    setTabKey((k) => k + 1); // reload the tab and recent changes: the role's defaults changed
    if (!canManagePermissions) return;
    const now = await safeAsk({ title: t("perms.addNowTitle"), message: t("perms.addNowMessage"), confirmText: t("perms.addNow"), cancelText: t("perms.later") });
    if (now) {
      setTab("permissions");
    } else {
      navigate(-1);
    }
  };

  // POST /:tz/unlock
  const handleUnlock = async () => {
    const ok = await safeAsk({ title: t("perms.unlock"), message: t("perms.unlockConfirm"), confirmText: t("perms.unlock"), cancelText: t("perms.cancel") });
    if (!ok) return;
    setUnlocking(true);
    const res = await unlockUser(form.tz);
    setUnlocking(false);
    if (!res.ok) return toast.warn(permissionError(t, res));
    setForm((prev) => ({ ...prev, lockedAt: null, failedLoginCount: 0 }));
    toast.success(t("perms.unlocked"));
    setTabKey((k) => k + 1);
  };

  if (loading) return <div className={styles.formContainer}>جارٍ تحميل البيانات…</div>;
  if (err)      return <div className={styles.formContainer} style={{color:"#b91c1c"}}>{err}</div>;

  return (
    <div className={styles.formContainer}>
      <center><h1>{isEdit ? "تحديث بيانات المستخدم" : "اضافة مستخدم جديد"}</h1></center>

      {showTabs && (
        <div className={tabStyles.tabs} role="tablist">
          {["details", "permissions"].map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className={`${tabStyles.tabButton} ${tab === name ? tabStyles.tabActive : ""}`}
              onClick={() => setTab(name)}
            >
              {t(name === "details" ? "perms.detailsTab" : "perms.tab")}
            </button>
          ))}
        </div>
      )}

      {showTabs && tab === "permissions" ? (
        <PermissionsTab key={tabKey} tz={form.tz} />
      ) : (
      <>

      <fieldset className={sectionStyles.formSection}>
        <legend>بيانات الحساب</legend>
        <label>رقم الهوية:<span style={{color: "red"}}>*</span></label>
        <input name="tz" value={form.tz} onChange={onField} readOnly={!isNew} />
        <label style={{color: "red"}}>{error.tz}</label>

        {showPasswordField && (<>
        <label>كلمة السر:</label>
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
            disabled={fetchingPassword}
            onClick={async () => {
              // ملاحظة عربية
              if (!showPassword) {
                // ملاحظة عربية
                if (!form.password?.trim() || !passwordTouched) {
                  await handleFetchPassword();
                }
                setShowPassword(true);
                return;
              }

              // ملاحظة عربية
              setShowPassword(false);

              // ملاحظة عربية
              // ملاحظة عربية
              if (!passwordTouched) {
                setForm((prev) => ({ ...prev, password: '' }));
              }
            }}
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
            <label>{t("perms.role")}:</label>
            <select
              name="roles"
              value={form.roles?.[0] || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, roles: e.target.value ? [e.target.value] : [] }))}
            >
              <option value="">{t("perms.noRole")}</option>
              {newUserRoles.map((r) => <option key={r} value={r}>{t(ROLE_LABEL_KEY[r], r)}</option>)}
            </select>
          </>
        )}

        {isEdit && (
          <div className={tabStyles.roleRow}>
            <label htmlFor="user-role">{t("perms.role")}:</label>
            {canChangeRole && canManage ? (
              <>
                <select id="user-role" value={roleChoice} onChange={(e) => setRoleChoice(e.target.value)}>
                  {!currentRole && <option value="">{t("perms.noRole")}</option>}
                  {/* The current role always shows, even when it is not one the viewer may give. */}
                  {currentRole && !viewerRoles.includes(currentRole) && (
                    <option value={currentRole} disabled>{t(ROLE_LABEL_KEY[currentRole], currentRole)}</option>
                  )}
                  {viewerRoles.map((r) => <option key={r} value={r}>{t(ROLE_LABEL_KEY[r], r)}</option>)}
                </select>
                <button type="button" onClick={handleSaveRole} disabled={savingRole || !roleChoice || roleChoice === currentRole}>
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
            <small>{fillText(t("perms.lockedSince"), { when: new Date(form.lockedAt).toLocaleString(language, { timeZone: "Asia/Jerusalem" }) })}</small>
            {canStored("users.unlock") && canManage && (
              <button type="button" onClick={handleUnlock} disabled={unlocking}>{t("perms.unlock")}</button>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className={sectionStyles.formSection}>
        <legend>البيانات الشخصية</legend>
        <label>اسم المستخدم:<span style={{color: "red"}}>*</span></label>
        <input name="firstname" value={form.firstname} onChange={handleChange} required />
        <label style={{color: "red"}}>{error.firstname}</label>

        <label>اسم العائلة:<span style={{color: "red"}}>*</span></label>
        <input name="lastname" value={form.lastname} onChange={handleChange} required />
        <label style={{color: "red"}}>{error.lastname}</label>

        <label>تاريخ الميلاد:<span style={{color: "red"}}>*</span></label>
        <input
          name="birth_date"
          type="date"
          value={form.birth_date ? String(form.birth_date).slice(0, 10) : ''}
          onChange={onField}
        />
        <label style={{color: "red"}}>{error.birth_date}</label>

        <label>جنس:<span style={{color: "red"}}>*</span></label>
        <select name="gender" value={form.gender} onChange={onField}>
          <option value="">اختار الجنس</option>
          <option value="ذكر">ذكر</option>
          <option value="انثى">انثى</option>
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

        <label>هاتف:<span style={{color: "red"}}>*</span></label>
        <input
          name="phone"
          value={displayPhoneLocal(form.phone)}
          onChange={(e)=>onPhoneChange('phone', e.target.value)}
          placeholder="052-123-4567"
        />
        <label style={{color: "red"}}>{error.phone}</label>

        <label>بريد الكتروني:<span style={{color: "red"}}>*</span></label>
        <input name="email" value={form.email} onChange={onField} readOnly={!canEditEmail} />
        <label style={{color: "red"}}>{error.email}</label>
      </fieldset>

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
          <button type="button" onClick={() => setPhoto(null)} style={{ marginInlineStart: "8px" }}>
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
        {canSubmit && (
          <button type="submit" onClick={handleSubmit} style={{width:"100%"}}>
            {saving ? "حفظ..." : (isEdit ? "تعديل بيانات المستخدم" : "اضافة المستخدم")}
          </button>
        )}
        <br/>
        {isEdit && canManage && (
          <center>
          <div style={{margin: "0 auto"}}>
            <button type="button" style={{ background: "#7f1d1d", margin: "10px" }} onClick={handleHardDelete}>
              {"حذف الحساب"}
            </button>
            <button type="button" style={{ background: "#7f1d1d", margin: "10px" }} onClick={sendToRoomNoActive}>
              {"غلق الحساب"}
            </button>
          </div>
          </center>
        )}
        <br/>
        {(<button type="button" style={{ background: "#6b7280", width: "100%" }} onClick={() => navigate(-1)}>
          الرجوع للقائمة
        </button>)}
      </div>
      </>
      )}

      {/* {isEdit && canStored("audit.view") && form.tz && <RecentChanges key={tabKey} targetIds={[form.tz]} />} */}
    </div>
  );
};

export default EditUser;
