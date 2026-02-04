import React, { useEffect, useMemo, useState } from "react";
import { getAttendanceHistory } from "../../WebServer/services/attendance/functionsAttendance";
import { toast } from "../../ALERT/SystemToasts";
import AttendanceDonutChart from "./AttendanceDonutChart";

export default function AttendanceGeneral() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await getAttendanceHistory({
        from: from || undefined,
        to: to || undefined,
      });
      if (!res?.ok) throw new Error(res?.message || "خطأ");
      setRows(res.attendances || []);
    } catch (e) {
      toast.error("فشل تحميل الإحصائيات العامة");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // أول ما تفتح

  const chartData = useMemo(() => {
    const حاضر = rows.filter((a) => a.status === "حاضر").length;
    const غائب = rows.filter((a) => a.status === "غائب").length;
    const متأخر = rows.filter((a) => a.status === "متأخر").length;
    return [
      { name: "حاضر", value: حاضر },
      { name: "غائب", value: غائب },
      { name: "متأخر", value: متأخر },
    ];
  }, [rows]);

  return (
    <div dir="rtl">
      <h1 style={{ textAlign: "center" }}>כללי — إحصائيات عامة</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <div>
          <label>من تاريخ</label>
          <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} />
        </div>
        <div>
          <label>إلى تاريخ</label>
          <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} />
        </div>
        <button onClick={load} disabled={loading}>عرض</button>
        <div style={{ opacity: 0.7 }}>{loading ? "تحميل..." : `النتائج: ${rows.length}`}</div>
      </div>

      <div style={{ marginTop: 16 }}>
        <AttendanceDonutChart data={chartData} title="نِسَب الحضور (عام)" />
      </div>
    </div>
  );
}
