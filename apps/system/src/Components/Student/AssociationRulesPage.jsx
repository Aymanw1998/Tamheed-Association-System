import React from "react";
import RulesEditor from "./RulesEditor.jsx";

export default function AssociationRulesPage() {
  return <section dir="rtl" style={{ maxWidth: 900, margin: "0 auto" }}>
    <h1>قوانين الجمعية</h1>
    <p>تعديل القوانين ونشر النسخة التي يوافق عليها الأهل عند التسجيل أو التوقيع.</p>
    <RulesEditor />
  </section>;
}
