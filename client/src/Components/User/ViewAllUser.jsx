import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAll, recoverSystemAccount } from "../../WebServer/services/user/functionsUser.jsx";
import useLiveRefresh from "../../locks/useLiveRefresh";
import { recoveryResultKey } from "../../utils/passwordChange";
import styles from "./User.module.css";
import Fabtn from "../Global/Fabtn/Fabtn.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import UserStatusFilter from "./UserStatusFilter.jsx";
import { canStored, getStoredViewer } from "../../utils/session";
import Button from "../UI/Button.jsx";
import FilterDialog from "../UI/FilterDialog.jsx";
import MobileUserList from "./MobileUserList.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { resolveRole, roleLabel } from "../../utils/roles";
import { ask } from "../Provides/confirmBus";

const ViewAllUser = () => {
  const { t } = useI18n();
  const canCreateUsers = canStored("users.create");
  const canRecoverSystem = canStored("systemRecovery.reset");
  const [recovering, setRecovering] = useState(false);
  const viewer = getStoredViewer();
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

  // quiet: a live refresh keeps the list on screen instead of showing the loading state.
  const loadUsers = useCallback(async ({ quiet = false } = {}) => {
    console.log("UserId", userTZ, "Viewer", viewer);
    if (!quiet) setLoading(true);
    if (!quiet) setErr(null);

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
      if (quiet) return;
      setErr("تعذّر تحميل البيانات");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);
  useLiveRefresh(["user"], () => loadUsers({ quiet: true }));

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

  // A row opens the user's page, where print, edit, unlock, suspend and
  // delete are, and approve/activate for a waiting or suspended account
  // (owner, 2026-11-02); a click on the name link is left to it.
  const openUser = (event, user) => {
    if (event.target.closest("a, button")) return;
    navigate(`/users/${user.tz}`);
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

        <div style={{ marginTop: 12, marginBottom: 12 }}>
        <FilterDialog
          count={(status !== "active") + (roleFilter !== "all")}
          onClear={() => { setStatus("active"); setRoleFilter("all"); }}
          tour="users-status-filter"
          closeTour="users-filter-close"
        >
          <UserStatusFilter
            value={status}
            onChange={setStatus}
            counts={counts}
            compact={false}
          />

        <div className={styles.filterRow} data-tour="users-role-filter">
          <label htmlFor="role-filter" style={{ fontWeight: 600 }}>الدور</label>
          <select
            id="role-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">كل الأدوار</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </div>
        </FilterDialog>
        </div>

        <div className={styles.summary}>
          {status === "active" ? "المستخدمون الفعّالون" : status === "pending" ? "المستخدمون بانتظار الموافقة" : "الحسابات الموقوفة"}: {sortedFilteredUsers.length}
          {roleFilter !== "all" ? ` - ${roleLabel(roleFilter)}` : ""}
        </div>
      </div>

      {err && <div className={styles.formError}>{err}</div>}
      {!err && loading && <div className={styles.emptyState}>جارٍ تحديث البيانات…</div>}

      {!loading && !err && (
        <div className={styles.mobileOnly}>
          <MobileUserList
            users={sortedFilteredUsers}
            onOpen={(user) => navigate(`/users/${user.tz}`)}
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
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredUsers.length > 0 ? (
              sortedFilteredUsers.map((user) => (
                <tr
                  key={user._id}
                  className={styles.openRow}
                  onClick={(e) => openUser(e, user)}
                >
                  <td data-label="رقم الهوية">{user.tz}</td>
                  <td data-label="اسم المستخدم">
                    <Link to={`/users/${user.tz}`} className={styles.nameLink} data-tour="users-edit">{`${user.firstname || ""} ${user.lastname || ""}`.trim()}</Link>
                  </td>
                  <td data-label="العمر">
                    {user.birth_date ? new Date().getFullYear() - new Date(user.birth_date).getFullYear() : "-"}
                  </td>
                  <td data-label="الجنس">{user.gender || "-"}</td>
                  <td data-label="الدور">{roleLabel(resolveRole(user)) || (Array.isArray(user.roles) ? user.roles : []).join("، ") || "-"}</td>
                  <td data-label="الحالة">
                    {user.room === "waiting" ? <StatusBadge tone="warning">{t("record.waiting")}</StatusBadge>
                      : user.room === "noActive" ? <StatusBadge tone="neutral">{t("record.suspendedState")}</StatusBadge>
                      : user.lockedAt ? <StatusBadge tone="danger">{t("perms.locked")}</StatusBadge> : "-"}
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
