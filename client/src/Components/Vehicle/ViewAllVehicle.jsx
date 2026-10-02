import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { archiveVehicle, getAllVehicles, restoreVehicle } from "../../WebServer/services/vehicle/functionsVehicle.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import Field from "./Field.jsx";
import useVehiclePermissions from "./useVehiclePermissions";
import {
  countVehicles,
  expiryText,
  expiryTone,
  filterVehicles,
  formatDateOnly,
  formatPlate,
  insuranceTone,
} from "../../utils/vehicleDisplay";
import styles from "./Vehicle.module.css";

const STATUS_TONE = { active: "success", out_of_service: "warning", archived: "neutral" };

export default function ViewAllVehicle() {
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const access = useVehiclePermissions();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ search: "", type: "all", status: "all", docs: "all" });
  const [busyId, setBusyId] = useState("");

  const canView = access.can("view");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getAllVehicles();
    if (res.ok) setVehicles(res.vehicles || []);
    else setError(res.message || t("vehicles.loadError"));
    setLoading(false);
  }, [t]);

  useEffect(() => {
    if (!access.loading && canView) load();
    if (!access.loading && !canView) setLoading(false);
  }, [access.loading, canView, load]);

  const setFilter = (key) => (value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const visible = useMemo(() => filterVehicles(vehicles, filters), [vehicles, filters]);
  const counts = useMemo(() => countVehicles(vehicles), [vehicles]);

  const toggleArchive = async (vehicle) => {
    const archiving = vehicle.status !== "archived";
    if (archiving) {
      const confirmed = await ask("delete", {
        title: t("vehicles.archive"),
        message: t("vehicles.archiveConfirm"),
      }).catch(() => false);
      if (!confirmed) return;
    }
    setBusyId(vehicle._id);
    const res = archiving ? await archiveVehicle(vehicle._id) : await restoreVehicle(vehicle._id);
    setBusyId("");
    if (!res.ok) return toast.warn(res.message);
    toast.success(archiving ? t("vehicles.archived") : t("vehicles.restored"));
    setVehicles((prev) => prev.map((item) => (item._id === vehicle._id ? res.vehicle : item)));
  };

  const options = (group, extraAll = true) => [
    ...(extraAll ? [{ value: "all", label: t("vehicles.all") }] : []),
    ...Object.keys(t(`vehicles.${group}`, {})).map((key) => ({ value: key, label: t(`vehicles.${group}.${key}`) })),
  ];

  if (access.loading) return <div className={styles.page}><div className={styles.state}>{t("vehicles.loading")}</div></div>;
  if (!canView) {
    return (
      <div className={styles.page} dir={dir}>
        <div className={`${styles.state} ${styles.stateError}`} role="alert">{t("vehicles.noPermission")}</div>
      </div>
    );
  }

  const expiryCell = (status) => (
    <>
      <StatusBadge tone={expiryTone(status)}>{expiryText(status, t("vehicles.expiry", {}))}</StatusBadge>
    </>
  );

  const licenseCell = (vehicle) => (
    <>
      {formatDateOnly(vehicle.summary.license.validUntil) || ""}
      <span className={styles.sub}>{expiryCell(vehicle.summary.license)}</span>
    </>
  );
  const testCell = (vehicle) => (
    <>
      {formatDateOnly(vehicle.summary.test.dueDate) || ""}
      <span className={styles.sub}>{expiryCell(vehicle.summary.test)}</span>
    </>
  );
  const insuranceCell = (vehicle) => {
    const insurance = vehicle.summary.insurance;
    return (
      <>
        <StatusBadge tone={insuranceTone(insurance)}>{t(`vehicles.insuranceStatus.${insurance.status}`)}</StatusBadge>
        {insurance.status === "active" && (
          <span className={styles.sub}>{formatDateOnly(insurance.endDate)}</span>
        )}
      </>
    );
  };

  const actions = (vehicle) => (
    <div className={styles.rowActions}>
      <Button size="sm" variant="secondary" onClick={() => navigate(`/vehicles/${vehicle._id}`)}>
        {t("vehicles.open")}
      </Button>
      {access.can("edit") && vehicle.status !== "archived" && (
        <Button size="sm" onClick={() => navigate(`/vehicles/${vehicle._id}?edit=1`)}>
          {t("vehicles.edit")}
        </Button>
      )}
      {access.can("archive") && (
        <Button
          size="sm"
          variant={vehicle.status === "archived" ? "success" : "danger"}
          loading={busyId === vehicle._id}
          onClick={() => toggleArchive(vehicle)}
        >
          {vehicle.status === "archived" ? t("vehicles.restore") : t("vehicles.archive")}
        </Button>
      )}
    </div>
  );

  const activeCard = ["expired", "soon", "unknown"].includes(filters.docs)
    ? filters.docs
    : filters.docs === "all" && filters.status === "active"
      ? "active"
      : filters.docs === "all" && filters.status === "all"
        ? "all"
        : "";

  const summaryCards = [
    { key: "all", label: t("vehicles.summaryTotal"), value: counts.total, docs: "all" },
    { key: "active", label: t("vehicles.summaryActive"), value: counts.active, docs: "all", status: "active" },
    { key: "expired", label: t("vehicles.summaryExpired"), value: counts.expired, docs: "expired", tone: styles.summaryDanger },
    { key: "soon", label: t("vehicles.summarySoon"), value: counts.soon, docs: "soon", tone: styles.summaryWarning },
    { key: "unknown", label: t("vehicles.summaryMissing"), value: counts.unknown, docs: "unknown" },
  ];

  return (
    <div className={styles.page} dir={dir}>
      <div className={styles.pageHeader}>
        <div>
          <h1>{t("vehicles.title")}</h1>
          <p>{t("vehicles.subtitle")}</p>
        </div>
        {access.can("edit") && <Button onClick={() => navigate("/vehicles/new")}>{t("vehicles.add")}</Button>}
      </div>

      {!loading && !error && (
        <div className={styles.summary}>
          {summaryCards.map((card) => (
            <button
              key={card.key}
              type="button"
              className={`${styles.summaryCard} ${card.tone || ""}`}
              aria-pressed={card.key === activeCard}
              onClick={() => setFilters((prev) => ({ ...prev, docs: card.docs, status: card.status || "all" }))}
            >
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </button>
          ))}
        </div>
      )}

      <div className={styles.filters}>
        <Field
          id="vehicle-search"
          label={t("vehicles.search")}
          type="search"
          value={filters.search}
          onChange={setFilter("search")}
          placeholder={t("vehicles.searchPlaceholder")}
        />
        <Field
          id="vehicle-filter-type"
          label={t("vehicles.filterType")}
          type="select"
          value={filters.type}
          onChange={setFilter("type")}
          options={options("type")}
        />
        <Field
          id="vehicle-filter-status"
          label={t("vehicles.filterStatus")}
          type="select"
          value={filters.status}
          onChange={setFilter("status")}
          options={options("status")}
        />
        <Field
          id="vehicle-filter-docs"
          label={t("vehicles.filterDocs")}
          type="select"
          value={filters.docs}
          onChange={setFilter("docs")}
          options={[
            { value: "all", label: t("vehicles.all") },
            { value: "attention", label: t("vehicles.docsExpiredOrSoon") },
            { value: "expired", label: t("vehicles.docsExpired") },
            { value: "soon", label: t("vehicles.docsSoon") },
            { value: "unknown", label: t("vehicles.docsUnknown") },
          ]}
        />
      </div>

      {loading && <div className={styles.state} role="status">{t("vehicles.loading")}</div>}

      {!loading && error && (
        <div className={`${styles.state} ${styles.stateError}`} role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={load}>{t("vehicles.retry")}</Button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className={styles.state}>{vehicles.length === 0 ? t("vehicles.emptyFirst") : t("vehicles.empty")}</div>
      )}

      {!loading && !error && visible.length > 0 && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {["plate", "type", "vehicle", "responsible", "license", "test", "insurance", "status", "actions"].map((key) => (
                    <th key={key} scope="col">{t(`vehicles.col.${key}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((vehicle) => (
                  <tr key={vehicle._id}>
                    <td>
                      <span className={styles.plate}>{formatPlate(vehicle.plate)}</span>
                      {vehicle.nickname && <span className={styles.sub}>{vehicle.nickname}</span>}
                    </td>
                    <td>{t(`vehicles.type.${vehicle.type}`)}</td>
                    <td>
                      {[vehicle.make, vehicle.model].filter(Boolean).join(" ")}
                      {vehicle.year ? <span className={styles.sub}>{vehicle.year}</span> : null}
                    </td>
                    <td>{vehicle.responsibleName || "—"}</td>
                    <td>{licenseCell(vehicle)}</td>
                    <td>{testCell(vehicle)}</td>
                    <td>{insuranceCell(vehicle)}</td>
                    <td>
                      <StatusBadge tone={STATUS_TONE[vehicle.status] || "neutral"}>
                        {t(`vehicles.status.${vehicle.status}`)}
                      </StatusBadge>
                    </td>
                    <td>{actions(vehicle)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.cards}>
            {visible.map((vehicle) => (
              <article key={vehicle._id} className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.plate}>{formatPlate(vehicle.plate)}</span>
                  <StatusBadge tone={STATUS_TONE[vehicle.status] || "neutral"}>
                    {t(`vehicles.status.${vehicle.status}`)}
                  </StatusBadge>
                </div>
                <div className={styles.cardRow}>
                  <span>{t("vehicles.col.type")}</span>
                  <span>{t(`vehicles.type.${vehicle.type}`)}{vehicle.nickname ? ` — ${vehicle.nickname}` : ""}</span>
                </div>
                <div className={styles.cardRow}>
                  <span>{t("vehicles.col.vehicle")}</span>
                  <span>{[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") || "—"}</span>
                </div>
                <div className={styles.cardRow}>
                  <span>{t("vehicles.col.responsible")}</span>
                  <span>{vehicle.responsibleName || "—"}</span>
                </div>
                <div className={styles.cardRow}>
                  <span>{t("vehicles.col.license")}</span>
                  <span>{licenseCell(vehicle)}</span>
                </div>
                <div className={styles.cardRow}>
                  <span>{t("vehicles.col.test")}</span>
                  <span>{testCell(vehicle)}</span>
                </div>
                <div className={styles.cardRow}>
                  <span>{t("vehicles.col.insurance")}</span>
                  <span>{insuranceCell(vehicle)}</span>
                </div>
                {actions(vehicle)}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
