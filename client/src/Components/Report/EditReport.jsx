import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
// עדכן נתיב אם אצלך שונה:
import { create, update, getOne, /*softDelete,*/ deleteR } from "../../WebServer/services/report/functionsReport.jsx";
import { getAll } from "../../WebServer/services/user/functionsUser.jsx";
import styles from "./Report.module.css";
import { toast } from "../../ALERT/SystemToasts.jsx";
import {validate as validateINV, submit as submitFromParent} from "../../WebServer/services/inviteToken/functionInviteToken.jsx";

const  MultiTagSelect = ({
  options = [],
  value = [],
  onChange,
  placeholder = "Type to search...",
}) => {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options.filter((o) => !value.includes(o.value));
    return options
      .filter((o) => !value.includes(o.value))
      .filter((o) => o.label.toLowerCase().includes(s));
  }, [q, options, value]);

  const add = (v) => {
    if (value.includes(v)) return;
    onChange?.([...value, v]);
    setQ("");
  };

  const remove = (v) => {
    onChange?.(value.filter((x) => x !== v));
  };

  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 10, padding: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {value.map((v) => {
          const opt = options.find((o) => o.value === v);
          return (
            <span
              key={v}
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
              {opt?.label ?? v}
              <button
                type="button"
                onClick={() => remove(v)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
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
      />

      {filtered.length > 0 && (
        <div
          style={{
            marginTop: 8,
            border: "1px solid #eee",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {filtered.slice(0, 8).map((o) => (
            <div
              key={o.value}
              onClick={() => add(o.value)}
              style={{
                padding: 10,
                cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



const EditReport = ({parent = false}) => {
  const params = useParams();              // "new" או _id
  const navigate = useNavigate();

  const id = parent ? "new" : params.id;
  const isEdit =!parent && id !== "new";
  const isNew = !isEdit;

  const [form, setForm] = useState({
    _id: "",
    date: "", // אם תרצה תאריך אמיתי: Date
    attendance: [],
    title: [],
    info: "",
    createdBy: localStorage.getItem("user_id") || "",
    
  });

  const [users, setUsers] = useState([]);
  const [error, setError] = useState({
    date: "", // אם תרצה תאריך אמיתי: Date
    attendance: "",
    title: "",
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
        const res = await getOne(id); // מצפה ל-{ status, subs }
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
        const res = await getAll(); // מצפה ל-{ status, subs }
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

  // מחיקה קשיחה (אופציונלי)
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
      <h2>{isEdit ? "تحديث بيانات التقرير" : "اضافة تقرير جديد"}</h2>

      <label>عنوان التقرير:</label>
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
      
      <label>الحاضرون:</label>
      <MultiTagSelect
        options={users.map(u => ({ label: `${u.firstname} ${u.lastname}`, value: u._id }))}
        value={form.attendance}
        onChange={(vals) => setForm((prev) => ({ ...prev, attendance: vals }))}
        placeholder="اختر الحاضرين..."
      />
      <label style={{color: "red"}}>{error.attendance}</label>
      <br />
      <div className={styles.buttonRow} style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="submit" onClick={handleSubmit}>
          {saving ? "حفظ..." : parent ? "ارسال التفاصيل" : (isEdit ? "تعديل البيانات" : "اضافة التقرير")}
        </button>

        {isEdit && (
          <>
            <button type="button" style={{ background: "#7f1d1d" }} onClick={handleHardDelete}>
              حذف
            </button>
          </>
        )}

        {!parent && (<button type="button" style={{ background: "#6b7280" }} onClick={() => navigate(-1)}>
          الرجوع للقائمة
        </button>)}
      </div>
    </div>
  );
};

export default EditReport;
