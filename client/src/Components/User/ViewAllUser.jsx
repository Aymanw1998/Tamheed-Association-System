import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { changeStatus, deleteU, getAll } from "../../WebServer/services/user/functionsUser.jsx";
import styles from "./User.module.css";
import Fabtn from "../Global/Fabtn/Fabtn.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import UserStatusFilter from "./UserStatusFilter.jsx";
import { exportUserPdf } from "../ExportPDF/ExportPDF.jsx";
import { getStoredUserId, isStoredAdmin } from "../../utils/session";

const ViewAllUser = () => {
  const isAdmin = isStoredAdmin();
  const userId = getStoredUserId();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [status, setStatus] = useState("active");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showFab, setShowFab] = useState(false);
  const [addBtnEl, setAddBtnEl] = useState(null);

  const addBtnRef = useCallback((node) => {
    setAddBtnEl(node);
  }, []);

  useEffect(() => {
    if (!addBtnEl) {
      setShowFab(false);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        setShowFab(!entry.isIntersecting);
      },
      { root: null, threshold: 0.01 }
    );

    io.observe(addBtnEl);
    return () => io.disconnect();
  }, [addBtnEl]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const res = await getAll();
      if (!res?.ok) {
        throw new Error(res?.message || "يوجد خلل في جلب البيانات");
      }

      const data = Array.isArray(res.users) ? res.users : [];
      const filtered = data.filter((user) => String(user?._id ?? "") !== String(userId));
      setUsers(filtered);
    } catch (error) {
      console.error("User load error", error);
      setErr("يوجد خلل في جلب البيانات");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const roleOptions = useMemo(() => {
    const uniqueRoles = new Set();

    users.forEach((user) => {
      const roles = Array.isArray(user.roles) ? user.roles : [];
      roles.forEach((role) => {
        if (role) uniqueRoles.add(String(role));
      });
    });

    return Array.from(uniqueRoles);
  }, [users]);

  const sortedFilteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    const filteredBySearch = q
      ? users.filter((user) =>
          [
            user.tz,
            user.firstname,
            user.lastname,
            user.father_name,
            user.roles?.join(" "),
            new Date().getFullYear() - new Date(user.birth_date).getFullYear(),
          ]
            .map((value) => String(value ?? "").toLowerCase())
            .join(" ")
            .includes(q)
        )
      : users;

    const filteredByStatus = filteredBySearch.filter(
      (user) => String(user?.room ?? "active") === status
    );

    const filtered = roleFilter === "all"
      ? filteredByStatus
      : filteredByStatus.filter((user) =>
          (Array.isArray(user.roles) ? user.roles : []).some(
            (role) => String(role) === roleFilter
          )
        );

    const dirMul = sortDir === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (sortField === "info") {
        const aInfo = String(a.info ?? "");
        const bInfo = String(b.info ?? "");
        return aInfo.localeCompare(bInfo, "ar", { sensitivity: "base" }) * dirMul;
      }

      const aName = `${a.firstname || ""} ${a.lastname || ""}`.trim();
      const bName = `${b.firstname || ""} ${b.lastname || ""}`.trim();
      return aName.localeCompare(bName, "ar", { sensitivity: "base" }) * dirMul;
    });
  }, [users, searchTerm, sortField, sortDir, status, roleFilter]);

  const counts = useMemo(() => {
    let active = 0;
    let pending = 0;
    let inactive = 0;

    for (const user of users) {
      if (user.room === "waiting") pending += 1;
      else if (user.room === "noActive") inactive += 1;
      else active += 1;
    }

    return { active, pending, inactive };
  }, [users]);

  const handleAddUser = () => {
    navigate("/users/new");
  };

  const onWaitingToActive = async (user) => {
    try {
      const res = await changeStatus(user.tz, "waiting", "active");
      if (!res?.ok) throw new Error(res?.message || "تعذر قبول المستخدم");
      toast.success("تمت الموافقة على المستخدم");
      loadUsers();
    } catch (error) {
      console.error(error);
      toast.error("حدث خطأ أثناء الموافقة على المستخدم");
    }
  };

  const onNoActiveToActive = async (user) => {
    try {
      const res = await changeStatus(user.tz, "noActive", "active");
      if (!res?.ok) throw new Error(res?.message || "تعذر تفعيل المستخدم");
      toast.success("تم تفعيل المستخدم");
      loadUsers();
    } catch (error) {
      console.error(error);
      toast.error("حدث خطأ أثناء تفعيل المستخدم");
    }
  };

  const handleDeleteUser = async (user, from) => {
    try {
      const res = await deleteU(user.tz, from);
      if (!res?.ok) throw new Error(res?.message || "تعذر حذف المستخدم");
      toast.success("تم حذف المستخدم");
      loadUsers();
    } catch (error) {
      console.error(error);
      toast.error("حدث خطأ أثناء حذف المستخدم");
    }
  };

  return (
    <div>
      <div>
        <h1 style={{ textAlign: "center" }}>قائمة المستخدمين</h1>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="بحث..."
            style={{
              width: "80%",
              padding: "10px",
              margin: "10px",
              marginBottom: "20px",
              fontSize: "14px",
              border: "1px solid #ccc",
              borderRadius: "8px",
            }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <button
            ref={addBtnRef}
            id="page-add-user"
            style={{ backgroundColor: "green", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white" }}
            onClick={handleAddUser}
          >
            إضافة مستخدم جديد
          </button>

          <button
            style={{ backgroundColor: "#374151", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white" }}
            onClick={loadUsers}
            disabled={loading}
          >
            {loading ? "جاري التحديث" : "تحديث القائمة"}
          </button>
        </div>

        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <UserStatusFilter
            value={status}
            onChange={setStatus}
            counts={counts}
            compact={false}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <label htmlFor="role-filter" style={{ fontWeight: 600 }}>فلترة حسب الدور</label>
          <select
            id="role-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{
              minWidth: 220,
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
              backgroundColor: "#fff",
            }}
          >
            <option value="all">كل الأدوار</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 8, opacity: 0.7 }}>
          مجموع: {sortedFilteredUsers.length} مستخدمين{" "}
          {status === "active" ? "مُفاعلين" : status === "pending" ? "بالانتظار" : "حسابات موقوفة"}
          {roleFilter !== "all" ? ` - ${roleFilter}` : ""}
        </div>
      </div>

      {err && <div style={{ marginTop: 12, color: "#b91c1c" }}>{err}</div>}
      {!err && loading && <div style={{ marginTop: 12 }}>جاري تحديث البيانات</div>}

      {!loading && !err && (
        <table className={`table ${styles.subTable}`} style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>رقم الهوية</th>
              <th>اسم المستخدم</th>
              <th>العمر</th>
              <th>الجنس</th>
              <th>الدور</th>
              <th>للإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredUsers.length > 0 ? (
              sortedFilteredUsers.map((user) => (
                <tr key={user._id}>
                  <td data-label="رقم الهوية">{user.tz}</td>
                  <td data-label="اسم المستخدم">{`${user.firstname || ""} ${user.lastname || ""}`.trim()}</td>
                  <td data-label="العمر">
                    {user.birth_date ? new Date().getFullYear() - new Date(user.birth_date).getFullYear() : "-"}
                  </td>
                  <td data-label="الجنس">{user.gender || "-"}</td>
                  <td data-label="الدور">{(Array.isArray(user.roles) ? user.roles : []).join(", ") || "-"}</td>
                  <td data-label="للمعلومات">
                    {user.room !== "waiting" && user.room !== "noActive" && (
                      <>
                        <button
                          style={{ backgroundColor: "yellow", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white", alignItems: "center" }}
                          onClick={() => navigate(`/users/${user.tz}`)}
                        >
                          للتعديل
                        </button>
                        <button
                          style={{ backgroundColor: "blue", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white", alignItems: "center" }}
                          onClick={() => exportUserPdf(user)}
                        >
                          تحميل ملف المستخدم
                        </button>
                      </>
                    )}

                    {user.room === "waiting" && (
                      <>
                        <button
                          style={{ backgroundColor: "green", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white", alignItems: "center" }}
                          onClick={async () => onWaitingToActive(user)}
                        >
                          موافقة
                        </button>
                        <button
                          style={{ backgroundColor: "red", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white", alignItems: "center" }}
                          onClick={() => handleDeleteUser(user, "waiting")}
                        >
                          حذف
                        </button>
                      </>
                    )}

                    {user.room === "noActive" && (
                      <>
                        <button
                          style={{ backgroundColor: "green", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white", alignItems: "center" }}
                          onClick={async () => onNoActiveToActive(user)}
                        >
                          تفعيل
                        </button>
                        <button
                          style={{ backgroundColor: "red", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white", alignItems: "center" }}
                          onClick={() => handleDeleteUser(user, "noActive")}
                        >
                          حذف
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 16 }}>
                  لا يوجد بيانات لإظهارها
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Fabtn
        anchor="#page-add-user"
        visible={showFab && isAdmin}
        label="اضافة مستخدم جديد"
        onClick={() => {
          navigate("/users/new");
        }}
      />
    </div>
  );
};

export default ViewAllUser;
