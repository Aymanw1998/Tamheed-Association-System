import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { changeStatus, deleteU, getAll, unlockUser, recoverSystemAccount } from "../../WebServer/services/user/functionsUser.jsx";
import { recoveryResultKey } from "../../utils/passwordChange";
import styles from "./User.module.css";
import Fabtn from "../Global/Fabtn/Fabtn.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import UserStatusFilter from "./UserStatusFilter.jsx";
import { exportUserPdf } from "../ExportPDF/ExportPDF.jsx";
import { canStored, getStoredUserId, getStoredViewer } from "../../utils/session";
import Button from "../UI/Button.jsx";
import MobileUserList from "./MobileUserList.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { canManageTargetClient, resolveRole } from "../../utils/roles";
import { ask } from "../Provides/confirmBus";
import { useRolePicker, permissionError } from "./RolePickerDialog.jsx";

const ViewAllUser = () => {
  const { t } = useI18n();
  const { pickRole, roleDialog } = useRolePicker();
  const canCreateUsers = canStored("users.create");
  const canUnlock = canStored("users.unlock");
  const canRecoverSystem = canStored("systemRecovery.reset");
  const [recovering, setRecovering] = useState(false);
  // Hides actions on users the viewer may not manage (self, equal or higher
  // rank); the server refuses them anyway.
  const viewer = getStoredViewer();
  const canManage = (user) => canManageTargetClient(viewer, user);
  const userId = viewer.id;
  const userTZ = viewer.tz;
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
    console.log("UserId", userTZ, "Viewer", viewer);
    setLoading(true);
    setErr(null);

    try {
      const res = await getAll();
      if (!res?.ok) {
        throw new Error(res?.message || "تعذّر تحميل البيانات");
      }

      const data = Array.isArray(res.users) ? res.users : [];
      const filtered = data.filter((user) => String(user?._id ?? "") !== String(userId));
      setUsers(filtered);
    } catch (error) {
      console.error("User load error", error);
      setErr("تعذّر تحميل البيانات");
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

  // Approval assigns a role (the server requires one).
  const onWaitingToActive = async (user) => {
    const role = await pickRole(user);
    if (!role) return;
    const res = await changeStatus(user.tz, "waiting", "active", role);
    if (!res?.ok) return toast.error(permissionError(t, res));
    toast.success(t("perms.approved"));
    loadUsers();
  };

  // Reactivating a user who has no role is an approval too.
  const onNoActiveToActive = async (user) => {
    let role;
    if (!resolveRole(user)) {
      role = await pickRole(user);
      if (!role) return;
    }
    try {
      const res = await changeStatus(user.tz, "noActive", "active", role);
      if (!res?.ok) throw new Error(permissionError(t, res));
      toast.success("تم تفعيل المستخدم بنجاح");
      loadUsers();
    } catch (error) {
      console.error(error);
      toast.error(error.message || "تعذّر تفعيل المستخدم");
    }
  };

  const onUnlock = async (user) => {
    let ok = false;
    try {
      ok = await ask("change", { title: t("perms.unlock"), message: t("perms.unlockConfirm"), confirmText: t("perms.unlock"), cancelText: t("perms.cancel") });
    } catch {
      ok = false;
    }
    if (!ok) return;
    const res = await unlockUser(user.tz);
    if (!res.ok) return toast.warn(permissionError(t, res));
    toast.success(t("perms.unlocked"));
    loadUsers();
  };

  // Emails a temporary password to the system mailbox; the server allows it
  // only after 3 failed system sign-ins and never returns the password.
  const onRecoverSystem = async () => {
    let ok = false;
    try {
      ok = await ask("change", {
        title: t("systemRecovery.button"), message: t("systemRecovery.confirm"),
        confirmText: t("systemRecovery.button"), cancelText: t("perms.cancel"),
      });
    } catch {
      ok = false;
    }
    if (!ok) return;
    setRecovering(true);
    try {
      const res = await recoverSystemAccount();
      const key = recoveryResultKey(res);
      const message = t(`systemRecovery.${key}`);
      if (key === "sent") toast.success(message);
      else toast.warn(message);
    } finally {
      setRecovering(false);
    }
  };

  const handleDeleteUser = async (user, from) => {
    try {
      const res = await deleteU(user.tz, from);
      if (!res?.ok) throw new Error(res?.message || "تعذّر حذف المستخدم");
      toast.success("تم حذف المستخدم بنجاح");
      loadUsers();
    } catch (error) {
      console.error(error);
      toast.error("تعذّر حذف المستخدم");
    }
  };

  return (
    <div>
      <div>
        <h1 className={styles.pageTitle}>قائمة المستخدمين</h1>

        <div className={styles.toolbar}>
          <input
            type="search"
            data-tour="users-search"
            placeholder="بحث…"
            aria-label="بحث في قائمة المستخدمين"
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <Button ref={addBtnRef} id="page-add-user" data-tour="users-add" onClick={handleAddUser}>
            إضافة مستخدم جديد
          </Button>

          <Button variant="secondary" data-tour="users-refresh" onClick={loadUsers} loading={loading}>
            {loading ? "جارٍ التحديث…" : "تحديث القائمة"}
          </Button>

          {canRecoverSystem && String(userTZ) !== "000000000" &&(
            <Button variant="secondary" data-tour="users-recover" onClick={onRecoverSystem} loading={recovering}>
              {t("systemRecovery.button")}
            </Button>
          )}
        </div>

        <div data-tour="users-status-filter" style={{ marginTop: 12, marginBottom: 12 }}>
          <UserStatusFilter
            value={status}
            onChange={setStatus}
            counts={counts}
            compact={false}
          />
        </div>

        <div className={styles.filterRow} data-tour="users-role-filter">
          <label htmlFor="role-filter" style={{ fontWeight: 600 }}>التصفية حسب الدور</label>
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
          {status === "active" ? "المستخدمون الفعّالون" : status === "pending" ? "المستخدمون بانتظار الموافقة" : "الحسابات الموقوفة"}: {sortedFilteredUsers.length}
          {roleFilter !== "all" ? ` - ${roleFilter}` : ""}
        </div>
      </div>

      {err && <div className={styles.formError}>{err}</div>}
      {!err && loading && <div className={styles.emptyState}>جارٍ تحديث البيانات…</div>}

      {!loading && !err && (
        <div className={styles.mobileOnly}>
          <MobileUserList
            users={sortedFilteredUsers}
            onOpen={(user) => navigate(`/users/${user.tz}`)}
            onPdf={exportUserPdf}
            onActivate={(user) => (user.room === "waiting" ? onWaitingToActive(user) : onNoActiveToActive(user))}
            onDelete={(user) => handleDeleteUser(user, user.room)}
            onUnlock={canUnlock ? onUnlock : undefined}
            canManage={canManage}
          />
        </div>
      )}

      {!loading && !err && (
        <table data-tour="users-table" className={`table ${styles.subTable} ${styles.desktopOnly}`} style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>رقم الهوية</th>
              <th>اسم المستخدم</th>
              <th>العمر</th>
              <th>الجنس</th>
              <th>الدور</th>
              <th>الإجراءات</th>
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
                  <td data-label="الإجراءات">
                    <div className={styles.rowActions}>
                      {user.room !== "waiting" && user.room !== "noActive" && (
                        <>
                          {canManage(user) && (
                            <Button size="sm" variant="warning" data-tour="users-edit" onClick={() => navigate(`/users/${user.tz}`)}>
                              تعديل
                            </Button>
                          )}
                          <Button size="sm" variant="secondary" data-tour="users-pdf" onClick={() => exportUserPdf(user)}>
                            ملف المستخدم
                          </Button>
                          {user.lockedAt && <StatusBadge tone="danger">{t("perms.locked")}</StatusBadge>}
                          {user.lockedAt && canUnlock && canManage(user) && (
                            <Button size="sm" variant="secondary" onClick={() => onUnlock(user)}>
                              {t("perms.unlock")}
                            </Button>
                          )}
                        </>
                      )}

                      {user.room === "waiting" && canManage(user) && (
                        <>
                          <Button size="sm" variant="success" onClick={() => onWaitingToActive(user)}>
                            قبول
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => handleDeleteUser(user, "waiting")}>
                            حذف
                          </Button>
                        </>
                      )}

                      {user.room === "noActive" && canManage(user) && (
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
                  لا توجد بيانات لعرضها
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {roleDialog}

      <Fabtn
        anchor="#page-add-user"
        visible={showFab && canCreateUsers}
        label="إضافة مستخدم جديد"
        onClick={() => {
          navigate("/users/new");
        }}
      />
    </div>
  );
};

export default ViewAllUser;
