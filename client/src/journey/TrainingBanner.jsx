import React from "react";
import { useDemo } from "./demoMode";

// The orange bar shown at the top of every screen for as long as training
// mode is on, so demo data is never mistaken for real data.
const style = {
  position: "sticky",
  top: 0,
  zIndex: 9000,
  background: "#fe9900",
  color: "#1b2327",
  fontWeight: 700,
  fontSize: 15,
  lineHeight: 1.5,
  textAlign: "center",
  padding: "8px 16px",
  boxShadow: "0 2px 6px rgba(0, 0, 0, .2)",
};

export default function TrainingBanner() {
  const { on } = useDemo();
  if (!on) return null;
  return (
    <div role="status" dir="rtl" style={style} data-testid="training-banner">
      وضع التدريب — كل ما تراه بيانات تجريبية، ولا يُحفظ شيء في النظام
    </div>
  );
}
