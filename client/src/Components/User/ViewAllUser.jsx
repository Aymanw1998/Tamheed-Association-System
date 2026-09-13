import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { changeStatus, deleteU, getAll } from "../../WebServer/services/user/functionsUser.jsx";
import styles from "./User.module.css";
import Fabtn from "../Global/Fabtn/Fabtn.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import UserStatusFilter from "./UserStatusFilter.jsx";
import { exportUserPdf } from "../ExportPDF/ExportPDF.jsx";
import { getStoredUserId, isStoredAdmin } from "../../utils/session";
import Button from "../UI/Button.jsx";

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
        <h1 className={styles.pageTitle}>قائمة المستخدمين</h1>

        <div className={styles.toolbar}>
          <input
            type="search"
            placeholder="بحث..."
            aria-label="بحث في قائمة المستخدمين"
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <Button ref={addBtnRef} id="page-add-user" onClick={handleAddUser}>
            إضافة مستخدم جديد
          </Button>

          <Button variant="secondary" onClick={loadUsers} loading={loading}>
            {loading ? "جاري التحديث" : "تحديث القائمة"}
          </Button>
        </div>

        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <UserStatusFilter
            value={status}
            onChange={setStatus}
            counts={counts}
            compact={false}
          />
        </div>

        <div className={styles.filterRow}>
          <label htmlFor="role-filter" style={{ fontWeight: 600 }}>فلترة حسب الدور</label>
          <select
            id="role-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">كل الأدوار</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.summary}>
          مجموع: {sortedFilteredUsers.length} مستخدمين{" "}
          {status === "active" ? "مُفاعلين" : status === "pending" ? "بالانتظار" : "حسابات موقوفة"}
          {roleFilter !== "all" ? ` - ${roleFilter}` : ""}
        </div>
      </div>

      {err && <div className={styles.formError}>{err}</div>}
      {!err && loading && <div className={styles.emptyState}>جاري تحديث البيانات</div>}

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
                  <td data-label="للإجراءات">
                    <div className={styles.rowActions}>
                      {user.room !== "waiting" && user.room !== "noActive" && (
                        <>
                          <Button size="sm" variant="warning" onClick={() => navigate(`/users/${user.tz}`)}>
                            للتعديل
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => exportUserPdf(user)}>
                            تحميل ملف المستخدم
                          </Button>
                        </>
                      )}

                      {user.room === "waiting" && (
                        <>
                          <Button size="sm" variant="success" onClick={() => onWaitingToActive(user)}>
                            موافقة
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => handleDeleteUser(user, "waiting")}>
                            حذف
                          </Button>
                        </>
                      )}

                      {user.room === "noActive" && (
                        <>
                          <Button size="sm" variant="success" onClick={() => onNoActiveToActive(user)}>
                            تفعيل
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => handleDeleteUser(user, "noActive")}>
                            حذف
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className={styles.emptyState}>
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
