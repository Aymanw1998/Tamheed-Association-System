import React, { useState } from "react";
import SignaturePad from "./SignaturePad";
import styles from "./RegistrationConsent.module.css";

// One signing surface for registration, staff-assisted signing and parent links.
export default function ConsentFields({ rules, value, onChange, nameId = "signer-name", disabled = false }) {
  const [drawing, setDrawing] = useState(!value.signature);
  const change = (patch) => { if (!disabled) onChange((previous) => ({ ...previous, ...patch })); };
  return <>
    <div className={styles.rules} dir="auto" tabIndex={0}>{rules.text}</div>
    <fieldset className={styles.fields} disabled={disabled}>
      <label className={styles.agreement}>
        <input type="checkbox" checked={value.accepted} onChange={(event) => change({ accepted: event.target.checked })} />
        <span>قرأت قوانين الجمعية وأوافق عليها</span>
      </label>
      <label htmlFor={nameId}>اسم ولي الأمر</label>
      <input id={nameId} name="signerName" maxLength={100} value={value.signerName} onChange={(event) => change({ signerName: event.target.value })} />
      <label>توقيع / ختم ولي الأمر</label>
      {!drawing && value.signature ? <div>
        <img className={styles.signature} src={value.signature} alt="توقيع/ختم ولي الأمر" />
        <button type="button" onClick={() => { change({ signature: "" }); setDrawing(true); }}>إعادة التوقيع/الختم</button>
      </div> : <SignaturePad onChange={(signature) => change({ signature })} />}
    </fieldset>
  </>;
}
