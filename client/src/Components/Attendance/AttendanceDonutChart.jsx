import React, { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/**
 * Expected data:
 * [
 *   { name: "حاضر", value: 10 },
 *   { name: "غائب", value: 3 },
 *   { name: "متأخر", value: 2 },
 * ]
 */

const DEFAULT_COLORS = {
  حاضر: "#22c55e",
  غائب: "#ef4444",
  متأخر: "#f59e0b",
};

function useCountUp(target, duration = 700) {
  const [val, setVal] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const to = Number.isFinite(target) ? target : 0;

    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    setVal(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return val;
}

const ActiveShape = (props) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value,
  } = props;

  // We render 2 pies: one normal, plus an outer "ring" to emphasize
  return (
    <g>
      {/* main slice */}
      <path d={props.sectorPath} fill={fill} />
      {/* outer ring */}
      <path d={props.outerSectorPath} fill={fill} opacity={0.25} />
      {/* label near slice */}
      <text x={cx} y={cy - outerRadius - 10} textAnchor="middle" fill="#111" style={{ fontSize: 12 }}>
        {payload?.name} — {value}
      </text>
    </g>
  );
};

// Recharts activeShape expects a function; we create a wrapper that uses Sector paths
import { Sector } from "recharts";
const renderActiveShape = (props) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value,
  } = props;

  // "pop out" effect
  const extra = 10;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + extra}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + extra + 2}
        outerRadius={outerRadius + extra + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.25}
      />
      <text x={cx} y={cy - (outerRadius + extra + 20)} textAnchor="middle" fill="#111" style={{ fontSize: 12 }}>
        {payload?.name} — {value}
      </text>
    </g>
  );
};

const AttendanceDonutChart = ({
  data = [],
  title = "نسب الحضور",
  colors = DEFAULT_COLORS,
  height = 300,
  donut = true,
  animate = true,
}) => {
  // make sure values are numbers and non-negative
  const safeData = useMemo(() => {
    return (Array.isArray(data) ? data : [])
      .map((d) => ({ name: d.name, value: Math.max(0, Number(d.value) || 0) }))
      .filter((d) => d.value > 0);
  }, [data]);

  const total = useMemo(
    () => safeData.reduce((sum, d) => sum + d.value, 0),
    [safeData]
  );

  // re-animate on every data change
  const [animKey, setAnimKey] = useState(0);
  useEffect(() => {
    setAnimKey((k) => k + 1);
  }, [JSON.stringify(safeData)]);

  const [activeIndex, setActiveIndex] = useState(0);

  // pick active slice
  const activeSlice = safeData[activeIndex] || null;
  const activePercentTarget = total && activeSlice ? (activeSlice.value / total) * 100 : 0;
  const activePercent = useCountUp(activePercentTarget, 650);

  const renderLabel = ({ name, value }) => {
    const percent = total ? Math.round((value / total) * 100) : 0;
    return `${name} ${percent}%`;
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    const v = item?.value || 0;
    const n = item?.name || "";
    const p = total ? Math.round((v / total) * 100) : 0;

    return (
      <div
        style={{
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "8px 10px",
          boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
          direction: "rtl",
          textAlign: "right",
          fontSize: 13,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{n}</div>
        <div>العدد: <b>{v}</b></div>
        <div>النسبة: <b>{p}%</b></div>
      </div>
    );
  };

  const CenterText = () => {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
          direction: "rtl",
          textAlign: "center",
        }}
      >
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{total || 0}</div>
          {activeSlice ? (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              <span style={{ fontWeight: 700 }}>{activeSlice.name}</span>{" "}
              <span style={{ opacity: 0.75 }}>—</span>{" "}
              <span style={{ fontWeight: 800 }}>{Math.round(activePercent)}%</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  if (!safeData.length) {
    return (
      <div style={{ padding: 16, textAlign: "center", opacity: 0.7 }}>
        لا يوجد بيانات لعرضها
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>

      <div style={{ position: "relative", width: "100%", height }}>
        <CenterText />

        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              key={animKey}
              data={safeData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={donut ? 58 : 0}
              outerRadius={90}
              paddingAngle={2}
              label={renderLabel}
              isAnimationActive={animate}
              animationBegin={0}
              animationDuration={900}
              animationEasing="ease-out"
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              onMouseEnter={(_, idx) => setActiveIndex(idx)}
            >
              {safeData.map((item) => (
                <Cell key={item.name} fill={colors[item.name] || "#8884d8"} />
              ))}
            </Pie>

            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AttendanceDonutChart;
