import React, { useEffect, useState, useMemo } from "react";
import { isValidIsraeliId } from "../../utils/israeliId";
import { useParams, useNavigate } from "react-router-dom";
// ملاحظة عربية
import { create, update, getOne, /*softDelete,*/ deleteR } from "../../WebServer/services/report/functionsReport.jsx";
import { getAll } from "../../WebServer/services/user/functionsUser.jsx";
import styles from "./Report.module.css";
import sectionStyles from "../UI/FormSection.module.css";
import { SHOW_REPORT_ATTENDEES } from "./reportOptions";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { canStored } from "../../utils/session";
import useItemLock from "../../locks/useItemLock";
import LockedScreen from "../../locks/LockedScreen";
import ReadOnlyArea from "../../locks/ReadOnlyArea";
import SaveNotice from "../../locks/SaveNotice";
import forceRelease from "../../locks/forceRelease";
import useReloadOnUnblock from "../../locks/useReloadOnUnblock";
import { handleSaveError, withBaseVersion } from "../../locks/staleSave";

const MultiTagSelect = ({
  options = [],
  value = [],
  onChange,
  placeholder = "Type to search...",
  allowCustom = false, // ✅ عربيالأربعاءالسبت
  tour = false, // journey anchors on the input and the first suggestion
}) => {
  const [q, setQ] = useState("");

  const norm = (s) => String(s ?? "").trim();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const selected = new Set(value.map(String));

    const base = options.filter((o) => !selected.has(String(o.value)));

    if (!s) return base;

    return base.filter((o) => String(o.label).toLowerCase().includes(s));
  }, [q, options, value]);

  const add = (v) => {
    const vv = norm(v);
    if (!vv) return;
    if (value.map(String).includes(String(vv))) return;
    onChange?.([...value, vv]);
    setQ("");
  };

  const remove = (v) => onChange?.(value.filter((x) => String(x) !== String(v)));

  const canCreate =
    allowCustom &&
    norm(q) &&
    !value.map(String).includes(norm(q)) &&
    !options.some((o) => String(o.value) === norm(q) || String(o.label) === norm(q));

  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 10, padding: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {value.map((v) => {
          const opt = options.find((o) => String(o.value) === String(v));
          return (
            <span
              key={String(v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #ddd",
                background: "#f7f7f7",
              }}
            >
              {opt?.label ?? String(v)}
              <button
                type="button"
                onClick={() => remove(v)}
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16 }}
                aria-label="remove"
              >
                ❌
              </button>
            </span>
          );
        })}
      </div>

      <input
        value={q}
        data-tour={tour ? "report-tags" : undefined}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (canCreate) add(q);                 // ملاحظة عربية
            else if (filtered[0]) add(filtered[0].value); // ملاحظة عربية
          }
          if (e.key === "Backspace" && !q && value.length) {
            // ملاحظة عربية
            remove(value[value.length - 1]);
          }
        }}
      />

      <div style={{ marginTop: 8, border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
        {canCreate && (
          <div
            onClick={() => add(q)}
            style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid #f0f0f0", background: "#f9fafb" }}
          >
            + إضافة: <b>{q}</b>
          </div>
        )}

        {filtered.slice(0, 8).map((o, index) => (
          <div
            key={String(o.value)}
            data-tour={tour && index === 0 ? "report-tag-option" : undefined}
            onClick={() => add(o.value)}
            style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
          >
            {o.label}
          </div>
        ))}
      </div>
    </div>
  );
};



const EditReport = ({parent = false}) => {
  const isAdmin = canStored("users.view"); // lists users for the attendees field
  const params = useParams();              // "new" الأحدالجمعة _id
  const navigate = useNavigate();

  const id = parent ? "new" : params.id;
  const isEdit =!parent && id !== "new";
  const isNew = !isEdit;

  const [form, setForm] = useState({
    _id: "",
    date: "", // ملاحظة عربية
    attendance: [],
    title: [],
    stitle: "",
    info: "",
    createdBy: localStorage.getItem("user_id") || "",
    
  });

  const [users, setUsers] = useState([]);
  const [error, setError] = useState({
    date: "", // ملاحظة عربية
    attendance: "",
    title: "",
    stitle: "",
    info: "",
    createdBy: "",
    
  })

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState(null);
  // The report as opened: its updatedAt is the baseVersion of the save.
  const [opened, setOpened]   = useState(null);
  const [notice, setNotice]   = useState(null);
  const lockKey = isEdit ? `report:${id}` : null;
  const lock = useItemLock(lockKey, { enabled: canStored("reports.editOwn") || canStored("reports.editAll") });
  const readonly = lock.status === "readonly";


  const load = async () => {
    try {
      setLoading(true);
      setErr(null);
      const res = await getOne(id);
      if(!res.ok) throw new Error(res.message);
      if (res) {
        const s = res.report;
        setForm(s);
        setOpened(s);
      } else {
        setErr("التقرير غير موجود");
      }
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

  const getUsers = async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await getAll(); // ملاحظة عربية
        if(!res.ok) throw new Error(res.message);
        if (res) {
          const s = res.users;
          setUsers(s);
        } else {
          setErr("تعذّر العثور على المستخدمين");
        }
      } catch (e) {
        setErr("تعذّر تحميل البيانات");
      } finally {
        setLoading(false);
      }
  }

  useEffect(() => {
    // GET /user/ is admin-only and its result is only used for the
    // admin-only "attendance" field below - skip it for other roles so a
    // 403 here doesn't block the rest of the form via the shared err state.
    if (!isAdmin || !SHOW_REPORT_ATTENDEES) return;
    getUsers();
  }, [isAdmin]);


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

  const handleSubmit = async (e) => {
    let b = await validate();
    if (b) { toast.warn(b); return; }
    b = true
    
    if(form.stitle.length === 0 || form.info === "") return toast.warn("يُرجى تعبئة الحقول المطلوبة");
    e.preventDefault();
    try {
      setSaving(true);
      setErr(null);

      const payload = { ...form };
      
      const res = isEdit ? await update(form._id, withBaseVersion(payload, opened)): await create({...payload});
      if(!res) return;
      if(!res.ok) {
        if (handleSaveError(res, { draft: form.info, setNotice })) return;
        throw new Error(res.message);
      }
      toast.success(isEdit ? "تم حفظ التقرير بنجاح" : "تمت إضافة التقرير بنجاح");
      navigate(-1);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "تعذّر إتمام العملية");
    } finally {
      setSaving(false);
    }
  };

  // ملاحظة عربية
  const handleHardDelete = async () => {
    if (!isEdit) return;
    try {
      const res = await deleteR(form._id);
      if(!res) return;
      if(!res.ok) throw new Error(res.message);

      toast.success("تم الحذف بنجاح");
      navigate(-1);
    } catch (e) {
      toast.error(e.message || "تعذّر إتمام العملية");
    }
  };
  if (loading) return <div className={styles.formContainer}>جارٍ تحميل البيانات…</div>;
  if (err)      return <div className={styles.formContainer} style={{color:"#b91c1c"}}>{err}</div>;
  if (lock.status === "blocked") {
    return <LockedScreen holder={lock.holder} onForceRelease={forceRelease(lockKey)} />;
  }

  return (
    <div className={styles.formContainer}>
      <center><h1>{isEdit ? "تعديل التقرير" : "إضافة تقرير جديد"}</h1></center>

      <SaveNotice notice={notice} />
      <ReadOnlyArea readonly={readonly} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <fieldset className={sectionStyles.formSection} data-tour="report-title">
        <legend>بيانات التقرير</legend>
        <label>عنوان التقرير:<span style={{color: "red"}}>*</span></label>
        <input
          type="text"
          name="stitle"
          data-tour="report-stitle"
          value={form.stitle}
          onChange={handleChange}
          required
        />
        <label style={{color: "red"}}>{error.stitle}</label>

        <label>عنوان ثانوي:</label>
        <MultiTagSelect
          options={[
            { label: "تقرير عام", value: "تقرير عام" },
            { label: "تقرير جمعية", value: "تقرير جمعية" },
            { label: "تقرير مجموعات", value: "تقرير مجموعات" },
            { label: "تقرير فعاليات", value: "تقرير فعاليات" },
          ]}
          value={form.title}
          onChange={(vals) => setForm((prev) => ({ ...prev, title: vals }))}
          placeholder="اختر عنوانًا ثانويًا…"
          allowCustom={true}
          tour
        />
        <label style={{color: "red"}}>{error.title}</label>
      </fieldset>

      <fieldset className={sectionStyles.formSection} data-tour="report-body">
        <legend>صلب الموضوع <span style={{color: "red"}}>*</span></legend>
        <textarea
          name="info"
          data-tour="report-info"
          aria-label="صلب الموضوع"
          value={form.info}
          rows={10}
          style={{ minHeight: 220 }}
          onChange={handleChange}
          required
        />
        <label style={{color: "red"}}>{error.info}</label>
      </fieldset>

      {isAdmin && SHOW_REPORT_ATTENDEES && (
        <fieldset className={sectionStyles.formSection} data-tour="report-attendees">
          <legend>الحاضرون</legend>
          <MultiTagSelect
            options={users.map(u => ({ label: `${u.firstname} ${u.lastname}`, value: u._id }))}
            value={form.attendance}
            onChange={(vals) => setForm((prev) => ({ ...prev, attendance: vals }))}
            placeholder="اختر الحاضرين…"
          />
          <label style={{color: "red"}}>{error.attendance}</label>
        </fieldset>
      )}
      </ReadOnlyArea>
      <div className={styles.buttonRow} style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="submit" data-tour="report-save" onClick={handleSubmit} disabled={readonly} style={{width:"100%"}}>
          {saving ? "جارٍ الحفظ…" : parent ? "إرسال الطلب" : (isEdit ? "حفظ التعديلات" : "إضافة التقرير")}
        </button>

        {isEdit && (
          <>
            <button type="button" data-tour="report-delete" style={{ background: "#7f1d1d", width:"100%" }} onClick={handleHardDelete} disabled={readonly}>
              حذف
            </button>
          </>
        )}

        {!parent && (<button type="button" style={{ background: "#6b7280", width:"100%"}} onClick={() => navigate(-1)}>
          العودة إلى القائمة
        </button>)}
      </div>
    </div>
  );
};

export default EditReport;
