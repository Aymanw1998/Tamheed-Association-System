import { useEffect, useState } from "react";
import * as api from "../api";
import { Link, navigate } from "../router.jsx";
import { useSession } from "../session.jsx";
import NasheedLines from "../ui/NasheedLines.jsx";
import { confirmDelete, deleteWithUndo } from "../ui/deleteNasheed";

// One nasheed for reading on a phone (owner, 2026-11-27), laid out like the
// PDF. The manager also gets «تعديل» and «حذف».
export default function Read({ id }) {
  const { user } = useSession();
  const [nasheed, setNasheed] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setNasheed(null);
    setError("");
    api.getPublic(id).then((res) => {
      if (!alive) return;
      if (!res.ok) setError(api.errorText(res, { NOT_FOUND: "النشيد غير موجود" }));
      else setNasheed(res.data.nasheed);
    });
    return () => { alive = false; };
  }, [id]);

  const remove = async () => {
    if (!(await confirmDelete(nasheed.title))) return;
    if (await deleteWithUndo(nasheed)) navigate("/");
  };

  if (error) {
    return (
      <section className="page">
        <p role="alert" className="error">{error}</p>
        <Link to="/">كل الأناشيد</Link>
      </section>
    );
  }
  if (!nasheed) return <p className="center muted">جارٍ التحميل…</p>;

  return (
    <article className="page read">
      <p className="back"><Link to="/">كل الأناشيد</Link></p>
      <h1 className="read-title">{nasheed.title}</h1>
      <NasheedLines lines={nasheed.lines} size={19} />
      {user && (
        <div className="row actions">
          <Link to={`/n/${nasheed._id}/edit`} className="button">تعديل</Link>
          <button type="button" className="danger" onClick={remove}>حذف</button>
        </div>
      )}
    </article>
  );
}
