import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  archiveVehicle,
  createVehicle,
  deleteVehicle,
  getResponsibles,
  getVehicle,
  restoreVehicle,
  updateVehicle,
} from "../../WebServer/services/vehicle/functionsVehicle.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import { setUnsavedChanges } from "../../utils/unsavedChanges";
import { fillText, formatPlate, normalizePlateInput, personOptionLabel } from "../../utils/vehicleDisplay";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import Field from "./Field.jsx";
import VehicleRecords from "./VehicleRecords.jsx";
import OfficialLookup from "./OfficialLookup.jsx";
import AttachmentsBar from "./AttachmentsBar.jsx";
import { VehicleDocuments, VehicleHistory } from "./VehicleDocuments.jsx";
import useVehiclePermissions from "./useVehiclePermissions";
import styles from "./Vehicle.module.css";

const emptyForm = {
  plate: "",
  nickname: "",
  type: "vehicle",
  classification: "",
  make: "",
  model: "",
  year: "",
  color: "",
  chassisNumber: "",
  registeredOwner: "",
  responsibleId: "",
  status: "active",
  notes: "",
  trailer: { selfWeightKg: "", grossWeightKg: "", payloadKg: "", brakes: "unknown", towingConditions: "" },
};

const toForm = (vehicle = {}) => ({
  ...emptyForm,
  ...Object.fromEntries(Object.keys(emptyForm).filter((key) => key !== "trailer").map((key) => [key, vehicle[key] ?? emptyForm[key]])),
  trailer: { ...emptyForm.trailer, ...(vehicle.trailer || {}) },
});

const sameForm = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function EditVehicle() {
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = id === "new";
  const access = useVehiclePermissions();

  const [vehicle, setVehicle] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saved, setSaved] = useState(emptyForm);
  const [editing, setEditing] = useState(isNew || searchParams.get("edit") === "1");
  const [tab, setTab] = useState("basic");
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [responsibles, setResponsibles] = useState([]);
  const [dirtyForms, setDirtyForms] = useState([]);
  // Where reviewed official values came from; sent with the save for the log.
  const [importSource, setImportSource] = useState(null);
  const [deleting, setDeleting] = useState(null); // null | { text, busy, error }

  const canView = access.can("view");
  const canEdit = access.can("edit");
  const archived = vehicle?.status === "archived";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const res = await getVehicle(id);
    if (res.ok) {
      setVehicle(res.vehicle);
      const next = toForm(res.vehicle);
      setForm(next);
      setSaved(next);
    } else {
      setLoadError(res.message || t("vehicles.loadError"));
    }
    setLoading(false);
  }, [id, t]);

  useEffect(() => {
    if (access.loading) return;
    if (!isNew && canView) load();
    else setLoading(false);
  }, [access.loading, isNew, canView, load]);

  useEffect(() => {
    if (!canEdit) return;
    getResponsibles().then((res) => res.ok && setResponsibles(res.users || []));
  }, [canEdit]);

  // Unsaved changes: the basic form differing from what was last saved, or any
  // record/document form with something typed in it.
  const dirty = editing && !sameForm(form, saved);
  const anyDirty = dirty || dirtyForms.length > 0;
  useEffect(() => {
    setUnsavedChanges(anyDirty);
  }, [anyDirty]);
  useEffect(() => () => setUnsavedChanges(null), []);

  const reportDirty = useCallback((key, isDirty) => {
    setDirtyForms((prev) => {
      const has = prev.includes(key);
      if (isDirty && !has) return [...prev, key];
      if (!isDirty && has) return prev.filter((item) => item !== key);
      return prev;
    });
  }, []);

  const setField = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setTrailer = (key) => (value) => setForm((prev) => ({ ...prev, trailer: { ...prev.trailer, [key]: value } }));

  // A record or document saved in another tab refreshes the vehicle, but must
  // not wipe edits still waiting in the basic form.
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const onVehicle = useCallback((next) => {
    const nextForm = toForm(next);
    setVehicle(next);
    setForm((prev) => (sameForm(prev, savedRef.current) ? nextForm : prev));
    setSaved(nextForm);
  }, []);

  const applyImport = (values, source) => {
    setForm((prev) => ({ ...prev, ...values }));
    setImportSource((prev) => ({
      name: source.name,
      fetchedAt: source.fetchedAt,
      fields: [...new Set([...(prev?.fields || []), ...source.fields])],
    }));
  };

  const buildPayload = () => ({
    ...form,
    ...(importSource ? { importSource } : {}),
    plate: normalizePlateInput(form.plate),
    year: form.year === "" ? "" : Number(form.year),
    trailer: Object.fromEntries(
      Object.entries(form.trailer).map(([key, value]) => [
        key,
        ["selfWeightKg", "grossWeightKg", "payloadKg"].includes(key) && value !== "" ? Number(value) : value,
      ])
    ),
  });

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = buildPayload();
    const res = isNew ? await createVehicle(payload) : await updateVehicle(id, payload);
    setSaving(false);
    if (!res.ok) {
      setErrors(res.errors || {});
      if (res.errors?.plate || res.errors?.type || res.errors?.year || res.errors?.responsibleId) setTab("basic");
      return toast.warn(res.message);
    }
    toast.success(isNew ? t("vehicles.created") : t("vehicles.updated"));
    if (isNew) {
      // The same component stays mounted when the address changes to the new
      // vehicle, so it must already hold that vehicle before navigating.
      setUnsavedChanges(false);
      setVehicle(res.vehicle);
      const savedForm = toForm(res.vehicle);
      setForm(savedForm);
      setSaved(savedForm);
      setImportSource(null);
      setEditing(false);
      navigate(`/vehicles/${res.vehicle._id}`, { replace: true });
      return;
    }
    onVehicle(res.vehicle);
    setForm(toForm(res.vehicle));
    setImportSource(null);
    setEditing(false);
  };

  const cancelEdit = () => {
    setImportSource(null);
    setForm(saved);
    setErrors({});
    setEditing(false);
  };

  const toggleArchive = async () => {
    if (!archived) {
      const confirmed = await ask("delete", { title: t("vehicles.archive"), message: t("vehicles.archiveConfirm") }).catch(() => false);
      if (!confirmed) return;
    }
    setBusy(true);
    const res = archived ? await restoreVehicle(id) : await archiveVehicle(id);
    setBusy(false);
    if (!res.ok) return toast.warn(res.message);
    toast.success(archived ? t("vehicles.restored") : t("vehicles.archived"));
    onVehicle(res.vehicle);
    setEditing(false);
  };

  const confirmDelete = async (event) => {
    event.preventDefault();
    setDeleting((prev) => ({ ...prev, busy: true, error: "" }));
    const res = await deleteVehicle(id, deleting.text);
    if (!res.ok) {
      setDeleting((prev) => ({ ...prev, busy: false, error: res.errors?.confirmPlate || res.message }));
      return;
    }
    setUnsavedChanges(false);
    toast.success(t("vehicles.del.done"));
    navigate("/vehicles", { replace: true });
  };

  const typeOptions = Object.keys(t("vehicles.type", {})).map((key) => ({ value: key, label: t(`vehicles.type.${key}`) }));
  const statusOptions = ["active", "out_of_service"].map((key) => ({ value: key, label: t(`vehicles.status.${key}`) }));
  const brakeOptions = Object.keys(t("vehicles.brakes", {})).map((key) => ({ value: key, label: t(`vehicles.brakes.${key}`) }));
  const responsibleOptions = useMemo(
    () => [
      { value: "", label: t("vehicles.f.noResponsible") },
      ...responsibles.map((person) => ({ value: person.id, label: personOptionLabel(person) })),
    ],
    [responsibles, t]
  );

  // An existing vehicle's page needs its data before anything below reads it.
  if (access.loading || loading || (!isNew && !vehicle && !loadError && canView)) {
    return <div className={styles.page}><div className={styles.state} role="status">{t("vehicles.loading")}</div></div>;
  }
  if (!canView || (isNew && !canEdit)) {
    return (
      <div className={styles.page} dir={dir}>
        <div className={`${styles.state} ${styles.stateError}`} role="alert">{t("vehicles.noPermission")}</div>
        <Button variant="secondary" onClick={() => navigate("/dashboard")}>{t("vehicles.back")}</Button>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className={styles.page} dir={dir}>
        <div className={`${styles.state} ${styles.stateError}`} role="alert">
          <p>{loadError}</p>
          <Button variant="secondary" onClick={load}>{t("vehicles.retry")}</Button>
        </div>
        <Button variant="secondary" onClick={() => navigate("/vehicles")}>{t("vehicles.back")}</Button>
      </div>
    );
  }

  const isTrailer = form.type === "trailer";
  const tabs = [
    { key: "basic", enabled: true },
    { key: "trailer", enabled: isTrailer, hidden: !isTrailer },
    { key: "license", enabled: !isNew, count: vehicle?.licenses?.length },
    { key: "test", enabled: !isNew, count: vehicle?.tests?.length },
    { key: "insurance", enabled: !isNew, count: vehicle?.policies?.length },
    { key: "documents", enabled: !isNew, hidden: !access.can("documents"), count: vehicle?.documents?.length },
    { key: "history", enabled: !isNew },
  ].filter((item) => !item.hidden);
  const activeTab = tabs.some((item) => item.key === tab) ? tab : "basic";
  const canWriteRecords = access.can("compliance");
  const fieldsDisabled = !editing;

  return (
    <div className={styles.page} dir={dir}>
      <div className={styles.pageHeader}>
        <div>
          <h1>
            {isNew ? t("vehicles.add") : (
              <>
                <span className={styles.plate}>{formatPlate(vehicle?.plate)}</span>{" "}
                {vehicle?.nickname || ""}
              </>
            )}
          </h1>
          {!isNew && (
            <p>
              {t(`vehicles.type.${vehicle.type}`)} ·{" "}
              <StatusBadge tone={archived ? "neutral" : vehicle.status === "active" ? "success" : "warning"}>
                {t(`vehicles.status.${vehicle.status}`)}
              </StatusBadge>
            </p>
          )}
        </div>
        <div className={styles.actionsRow}>
          {!isNew && canEdit && !archived && !editing && (
            <Button onClick={() => setEditing(true)}>{t("vehicles.edit")}</Button>
          )}
          {!isNew && access.can("archive") && (
            <Button variant={archived ? "success" : "danger"} loading={busy} onClick={toggleArchive}>
              {archived ? t("vehicles.restore") : t("vehicles.archive")}
            </Button>
          )}
          {!isNew && access.isAdmin && !deleting && (
            <Button variant="danger" onClick={() => setDeleting({ text: "", busy: false, error: "" })}>{t("vehicles.del.button")}</Button>
          )}
          <Button variant="secondary" onClick={() => navigate("/vehicles")}>{t("vehicles.back")}</Button>
        </div>
      </div>

      {deleting && (
        <form className={styles.inlineForm} onSubmit={confirmDelete} noValidate role="alertdialog" aria-labelledby="vehicle-delete-title">
          <strong id="vehicle-delete-title" className={styles.fieldError}>{t("vehicles.del.title")}</strong>
          <p className={styles.note}>{t("vehicles.del.warning")}</p>
          <Field
            id="vehicle-delete-confirm"
            label={fillText(t("vehicles.del.confirmLabel"), { plate: vehicle.plate })}
            value={deleting.text}
            onChange={(text) => setDeleting((prev) => ({ ...prev, text }))}
            error={deleting.error}
            dir="ltr"
            autoComplete="off"
          />
          <div className={styles.actionsRow}>
            <Button type="submit" variant="danger" loading={deleting.busy} disabled={normalizePlateInput(deleting.text) !== vehicle.plate}>
              {t("vehicles.del.confirm")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>{t("vehicles.cancel")}</Button>
          </div>
        </form>
      )}

      <div className={styles.tabs} role="tablist" aria-label={t("vehicles.title")}>
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`vehicle-tab-${item.key}`}
            aria-selected={activeTab === item.key}
            aria-controls={`vehicle-panel-${item.key}`}
            disabled={!item.enabled}
            className={styles.tab}
            onClick={() => setTab(item.key)}
          >
            {t(`vehicles.tabs.${item.key}`)}
            {item.count > 0 && <span className={styles.tabCount}>{item.count}</span>}
          </button>
        ))}
      </div>
      {isNew && <p className={styles.note}>{t("vehicles.savedFirst")}</p>}

      <div role="tabpanel" id={`vehicle-panel-${activeTab}`} aria-labelledby={`vehicle-tab-${activeTab}`}>
        {(activeTab === "basic" || activeTab === "trailer") && (
          <form className={styles.panel} onSubmit={save} noValidate>
            {!isNew && vehicle && (
              <AttachmentsBar
                vehicle={vehicle}
                linkedType="vehicle"
                defaultKind="other"
                canAccess={access.can("documents")}
                canUpload={access.can("documents") && !archived}
                onVehicle={onVehicle}
              />
            )}
            {activeTab === "basic" && (
              <div className={styles.formGrid}>
                <Field id="v-plate" label={t("vehicles.f.plate")} value={form.plate} onChange={setField("plate")}
                  error={errors.plate} required disabled={fieldsDisabled} inputMode="text" autoComplete="off" dir="ltr" />
                <Field id="v-nickname" label={t("vehicles.f.nickname")} value={form.nickname} onChange={setField("nickname")} disabled={fieldsDisabled} />
                {editing && <OfficialLookup form={form} onApply={applyImport} />}
                <Field id="v-type" type="select" label={t("vehicles.f.type")} value={form.type} onChange={setField("type")}
                  options={typeOptions} error={errors.type} required disabled={fieldsDisabled} />
                <Field id="v-classification" label={t("vehicles.f.classification")} value={form.classification} onChange={setField("classification")} disabled={fieldsDisabled} />
                <Field id="v-make" label={t("vehicles.f.make")} value={form.make} onChange={setField("make")} disabled={fieldsDisabled} />
                <Field id="v-model" label={t("vehicles.f.model")} value={form.model} onChange={setField("model")} disabled={fieldsDisabled} />
                <Field id="v-year" type="number" label={t("vehicles.f.year")} value={form.year} onChange={setField("year")}
                  error={errors.year} disabled={fieldsDisabled} min="1900" step="1" />
                <Field id="v-color" label={t("vehicles.f.color")} value={form.color} onChange={setField("color")} disabled={fieldsDisabled} />
                <Field id="v-chassis" label={t("vehicles.f.chassisNumber")} value={form.chassisNumber} onChange={setField("chassisNumber")} disabled={fieldsDisabled} dir="ltr" />
                <Field id="v-owner" label={t("vehicles.f.registeredOwner")} value={form.registeredOwner} onChange={setField("registeredOwner")} disabled={fieldsDisabled} />
                {canEdit && editing ? (
                  <Field id="v-responsible" type="select" label={t("vehicles.f.responsible")} value={form.responsibleId}
                    onChange={setField("responsibleId")} options={responsibleOptions} error={errors.responsibleId} />
                ) : (
                  <Field id="v-responsible" label={t("vehicles.f.responsible")} value={vehicle?.responsibleName || ""} onChange={() => {}} disabled />
                )}
                <Field id="v-status" type="select" label={t("vehicles.f.status")} value={archived ? "archived" : form.status}
                  onChange={setField("status")} disabled={fieldsDisabled || archived}
                  options={archived ? [{ value: "archived", label: t("vehicles.status.archived") }] : statusOptions} />
                <Field id="v-notes" type="textarea" label={t("vehicles.f.notes")} value={form.notes} onChange={setField("notes")} disabled={fieldsDisabled} wide />
              </div>
            )}

            {activeTab === "trailer" && (
              <>
                <p className={styles.note}>{t("vehicles.trailerNote")}</p>
                <div className={styles.formGrid}>
                  <Field id="t-self" type="number" label={t("vehicles.f.selfWeight")} value={form.trailer.selfWeightKg}
                    onChange={setTrailer("selfWeightKg")} error={errors["trailer.selfWeightKg"]} disabled={fieldsDisabled} min="0" />
                  <Field id="t-gross" type="number" label={t("vehicles.f.grossWeight")} value={form.trailer.grossWeightKg}
                    onChange={setTrailer("grossWeightKg")} error={errors["trailer.grossWeightKg"]} disabled={fieldsDisabled} min="0" />
                  <Field id="t-payload" type="number" label={t("vehicles.f.payload")} value={form.trailer.payloadKg}
                    onChange={setTrailer("payloadKg")} error={errors["trailer.payloadKg"]} disabled={fieldsDisabled} min="0" />
                  <Field id="t-brakes" type="select" label={t("vehicles.f.brakes")} value={form.trailer.brakes}
                    onChange={setTrailer("brakes")} options={brakeOptions} error={errors["trailer.brakes"]} disabled={fieldsDisabled} />
                  <Field id="t-towing" type="textarea" label={t("vehicles.f.towingConditions")} value={form.trailer.towingConditions}
                    onChange={setTrailer("towingConditions")} disabled={fieldsDisabled} wide />
                </div>
              </>
            )}

            {editing && (
              <div className={styles.actionsRow}>
                <Button type="submit" loading={saving}>{isNew ? t("vehicles.save") : t("vehicles.saveChanges")}</Button>
                {!isNew && <Button type="button" variant="secondary" onClick={cancelEdit}>{t("vehicles.cancel")}</Button>}
              </div>
            )}
          </form>
        )}

        {["license", "test", "insurance"].includes(activeTab) && vehicle && (
          <VehicleRecords
            key={activeTab}
            kind={{ license: "license", test: "test", insurance: "policy" }[activeTab]}
            vehicle={vehicle}
            canEdit={canWriteRecords}
            canAccessDocs={access.can("documents")}
            canUploadDocs={access.can("documents")}
            onVehicle={onVehicle}
            onDirtyChange={reportDirty}
          />
        )}

        {activeTab === "documents" && vehicle && (
          <VehicleDocuments
            vehicle={vehicle}
            canAccess={access.can("documents")}
            canUpload={access.can("documents")}
            onVehicle={onVehicle}
            onDirtyChange={reportDirty}
          />
        )}

        {activeTab === "history" && vehicle && <VehicleHistory vehicleId={vehicle._id} />}
      </div>
    </div>
  );
}
