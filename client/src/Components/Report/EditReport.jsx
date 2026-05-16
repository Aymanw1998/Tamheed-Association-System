import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
// ملاحظة عربية
import { create, update, getOne, /*softDelete,*/ deleteR } from "../../WebServer/services/report/functionsReport.jsx";
import { getAll } from "../../WebServer/services/user/functionsUser.jsx";
import styles from "./Report.module.css";
import { toast } from "../../ALERT/SystemToasts.jsx";
import {validate as validateINV, submit as submitFromParent} from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { isStoredAdmin } from "../../utils/session";

const MultiTagSelect = ({
  options = [],
  value = [],
  onChange,
  placeholder = "Type to search...",
  allowCustom = false, // ✅ عربيالأربعاءالسبت
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
            ➕ إضافة: <b>{q}</b>
          </div>
        )}

        {filtered.slice(0, 8).map((o) => (
          <div
            key={String(o.value)}
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
  const isAdmin = isStoredAdmin();
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


  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        console.log("load training");
        setLoading(true);
        setErr(null);
        const res = await getOne(id);
        if(!res.ok) throw new Error(res.message);
        if (res) {
          const s = res.report;
          setForm(s);
        } else {
          setErr("التقرير غير موجود");
        }
      } catch (e) {
        setErr("خلل في جلب البيانات");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

  const getUsers = async () => {
      try {
        console.log("load training");
        setLoading(true);
        setErr(null);
        const res = await getAll(); // ملاحظة عربية
        if(!res.ok) throw new Error(res.message);
        if (res) {
          const s = res.users.filter(u => u.roles.includes("ادارة"));
          setUsers(s);
        } else {
          setErr("الاداريين غير موجود");
        }
      } catch (e) {
        setErr("خلل في جلب البيانات");
      } finally {
        setLoading(false);
      }
  }

  useEffect(() => {
    getUsers();
  }, []);
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
      console.log(isNew && value === "");
        if (value === "") {
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "املأ الحقل";
        } 
        else if(!isValidIsraeliId(value)){
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "رقم الهوية غير صالح"
        }
        else if(isNew) {
          const data = parent ? {ok: false} : await getOne(value)
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
          console.log("birth_date", value, form.birth_date);
          if(value !== ""){
            const date = new Date(value); 
          }
          else {
          tag?.style.setProperty('border', '2px solid red'); // ملاحظة عربية
          return "اختر تاريخ الميلاد";
          }
        } catch {
          console.log("invalid date");
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
    console.log(`onField[${name}] = ${String(value)}`, value === '');
    setForm((prev) => ({ ...prev, [name]: value }));
    const msg = await validate(name, value)
    // console.log("msg", msg);
    setError((prev) => ({ ...prev, [name]: msg }));
  };

  const handleSubmit = async (e) => {
    let b = await validate();
    if (b) { toast.warn(b); return; }
    b = true
    
    if(form.title.length === 0 || form.info === "") return toast.warn("فحص الحقول المطلوبة");
    e.preventDefault();
    try {
      setSaving(true);
      setErr(null);

      const payload = { ...form };
      
      const res = isEdit ? await update(form._id, payload): await create({...payload});
      console.log("res", res);
      if(!res) return;
      if(!res.ok) throw new Error(res.message);
      toast.success(`✅ التقرير ${isEdit ? 'حُديث' : 'حُفِظ'} بنجاح`);
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
      const res = await deleteR(form._id);
      if(!res) return;
      if(!res.ok) throw new Error(res.message);

      toast.success("✅ تم الحذف بنجاح");
      navigate(-1);
    } catch (e) {
      toast.error(e.message || "❌ فشل العملية");
    }
  };
  // ملاحظة عربية
  if (parent) {
    if (inviteStatus.checking) {
      return (
        <div className={styles.formContainer}>
          جار فحص صلاحية رابط التسجيل...
        </div>
      );
    }
    if (!inviteStatus.valid) {
      return (
        <div
          className={styles.formContainer}
          style={{ color: "#b91c1c", textAlign: "center" }}
        >
          <h2>الرابط غير صالح</h2>
          <p>{inviteStatus.message || "يرجى طلب رابط جديد من المعلم."}</p>
        </div>
      );
    }
  }

  if (loading) return <div className={styles.formContainer}>يتحدث...</div>;
  if (err)      return <div className={styles.formContainer} style={{color:"#b91c1c"}}>{err}</div>;

  return (
    <div className={styles.formContainer}>
      <center><h1>{isEdit ? "تحديث بيانات التقرير" : "اضافة تقرير جديد"}</h1></center>

      <label>عنوان التقرير:</label>
      <input
        type="text"
        name="stitle"
        value={form.stitle}
        onChange={handleChange}
        required
      />
      <label style={{color: "red"}}>{error.stitle}</label>
      <br />
      
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
        placeholder="اختر عنوان التقرير..."
        allowCustom={true}
      />
      <label style={{color: "red"}}>{error.title}</label>
      <br />

      <label>صلب الموضوع:</label>
      <textarea
        name="info"
        value={form.info}
        rows={10}
        style={{
          width: "100%",
          minHeight: 220,
          padding: 14,
          fontSize: 16,
          lineHeight: 1.6,
          borderRadius: 12,
          border: "1px solid #ccc",
          resize: "vertical",
          fontFamily: "inherit",
        }}
        onChange={handleChange}
        required
      />
      <label style={{color: "red"}}>{error.info}</label>
      <br />
      
      {localStorage.getItem("roles").includes("ادارة") && <><label>الحاضرون:</label>
      <MultiTagSelect
        options={users.map(u => ({ label: `${u.firstname} ${u.lastname}`, value: u._id }))}
        value={form.attendance}
        onChange={(vals) => setForm((prev) => ({ ...prev, attendance: vals }))}
        placeholder="اختر الحاضرين..."
      />
      <label style={{color: "red"}}>{error.attendance}</label>
      <br /></>}
      <div className={styles.buttonRow} style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="submit" onClick={handleSubmit} style={{width:"100%"}}>
          {saving ? "حفظ..." : parent ? "ارسال التفاصيل" : (isEdit ? "تعديل البيانات" : "اضافة التقرير")}
        </button>

        {isEdit && (
          <>
            <button type="button" style={{ background: "#7f1d1d", width:"100%" }} onClick={handleHardDelete}>
              حذف
            </button>
          </>
        )}

        {!parent && (<button type="button" style={{ background: "#6b7280", width:"100%"}} onClick={() => navigate(-1)}>
          الرجوع للقائمة
        </button>)}
      </div>
    </div>
  );
};

export default EditReport;
