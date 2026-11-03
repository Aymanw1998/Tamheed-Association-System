import { useCallback, useEffect, useState } from "react";
import { addMember, blockMember, errorText, getMembers, removeMember, unblockMember } from "../api";
import { roleLabel } from "../strings";
import Avatar from "../ui/Avatar.jsx";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import { passportSrc } from "../ui/passportPhoto";

const ADD_ERRORS = {
  NO_REAL_EMAIL: "لا يمكن جعل المستخدم من قسم IT: ليس لديه بريد إلكتروني حقيقي.",
  ALREADY_IT: "المستخدم من قسم IT بالفعل.",
  NOT_FOUND: "المستخدم غير موجود بين المستخدمين النشطين.",
  SYSTEM_ACCOUNT: "لا يمكن تعديل حساب النظام.",
  NOT_IT: "المستخدم ليس من قسم IT.",
};

// IT users: shown to the system account only (the server checks too).
export default function Members() {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState({ text: "", bad: false });
  const [tz, setTz] = useState("");
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    const res = await getMembers();
    if (res.ok) setMembers(res.data.members || []);
    else setError(errorText(res));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (call, okText) => {
    setNotice({ text: "", bad: false });
    const res = await call();
    if (!res.ok) { setNotice({ text: errorText(res, ADD_ERRORS), bad: true }); return false; }
    setNotice({ text: okText, bad: false });
    await load();
    return true;
  };

  const add = async (event) => {
    event.preventDefault();
    if (await act(() => addMember(tz.trim()), "تمت الإضافة")) setTz("");
  };

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!members) return <p role="status">…</p>;

  return (
    <section>
      <h1>مستخدمو IT</h1>
      <form className="row card" onSubmit={add}>
        <input name="tz" inputMode="numeric" placeholder="رقم هوية مستخدم موجود" aria-label="رقم الهوية" value={tz} onChange={(e) => setTz(e.target.value)} required />
        <button type="submit" className="primary">إضافة مستخدم IT</button>
      </form>
      {notice.text && <p role={notice.bad ? "alert" : "status"} className={notice.bad ? "error" : "ok"}>{notice.text}</p>}
      {members.length === 0 ? <p>لا يوجد مستخدمو IT بعد.</p> : (
        <ul className="list">
          {members.map((member) => {
            const name = `${member.firstname} ${member.lastname}`.trim();
            const blocked = Boolean(member.itBlockedAt);
            return (
              <li key={member.tz} data-member={member.tz} className="device">
                <Avatar src={passportSrc(member.photo) || ""} name={name} />
                <span className="grow">
                  <strong>{name || member.tz}</strong>
                  <small className="muted">{member.tz} — {roleLabel(member.role)}</small>
                </span>
                {blocked && <span className="badge danger">محظور</span>}
                {blocked ? (
                  <button type="button" onClick={() => act(() => unblockMember(member.tz), "تم إلغاء الحظر")}>إلغاء الحظر</button>
                ) : (
                  <button type="button" onClick={() => act(() => blockMember(member.tz), "تم الحظر")}>حظر</button>
                )}
                <button type="button" onClick={() => setConfirm(member)}>إزالة</button>
              </li>
            );
          })}
        </ul>
      )}
      {confirm && (
        <ConfirmDialog
          title="إزالة من قسم IT"
          message={`إزالة ${`${confirm.firstname} ${confirm.lastname}`.trim() || confirm.tz} من مستخدمي IT؟ يبقى مستخدمًا في النظام.`}
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const target = confirm; setConfirm(null); act(() => removeMember(target.tz), "تمت الإزالة"); }}
        />
      )}
    </section>
  );
}
