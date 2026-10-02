import React, { useEffect, useMemo, useState } from "react";
import { licenseApi, policyApi, setNextTestDate, testApi } from "../../WebServer/services/vehicle/functionsVehicle.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import Field from "./Field.jsx";
import AttachmentsBar from "./AttachmentsBar.jsx";
import {
  expiryText,
  expiryTone,
  fillText,
  formatDateOnly,
  insuranceTone,
} from "../../utils/vehicleDisplay";
import styles from "./Vehicle.module.css";

// One generic tab drives licences, tests and policies: they all share "add a
// record, correct it (dates need a reason), retire it, never delete it".
// `guarded` fields are the dates that need a reason once they have a value.
const KINDS = {
  license: {
    api: licenseApi,
    list: "licenses",
    addLabel: "vehicles.addLicense",
    note: "vehicles.licenseNote",
    retireLabel: "vehicles.voidRecord",
    retiredLabel: "vehicles.voidedOn",
    retiredAt: "voidedAt",
    guarded: ["validFrom", "validUntil"],
    fields: [
      { key: "validFrom", type: "date" },
      { key: "validUntil", type: "date", required: true },
      { key: "feeStatus", type: "select", group: "feeStatus", fallback: "unknown" },
      { key: "feePaidDate", type: "date" },
      { key: "feeAmount", type: "number", step: "0.01", min: "0" },
      { key: "notes", type: "textarea", wide: true },
    ],
  },
  test: {
    api: testApi,
    list: "tests",
    addLabel: "vehicles.addTest",
    note: "vehicles.testNote",
    retireLabel: "vehicles.voidRecord",
    retiredLabel: "vehicles.voidedOn",
    retiredAt: "voidedAt",
    guarded: ["testDate", "retestDate"],
    fields: [
      { key: "testDate", type: "date", labelKey: "testDate" },
      { key: "result", type: "select", group: "testResult", labelKey: "testResult", required: true, blank: true },
      { key: "institute", type: "text" },
      { key: "retestDate", type: "date" },
      { key: "nextTestDate", type: "date", addOnly: true },
      { key: "exemptionReason", type: "text", showWhen: (draft) => draft.result === "exempt", required: true },
      { key: "defects", type: "textarea", wide: true },
      { key: "notes", type: "textarea", wide: true },
    ],
  },
  policy: {
    api: policyApi,
    list: "policies",
    addLabel: "vehicles.addPolicy",
    note: "vehicles.insuranceNote",
    retireLabel: "vehicles.cancelPolicy",
    retiredLabel: "vehicles.cancelledOn",
    retiredAt: "cancelledAt",
    guarded: ["startDate", "endDate"],
    fields: [
      { key: "type", type: "select", group: "policyType", labelKey: "policyType", required: true, blank: true },
      { key: "insurer", type: "text", required: true },
      { key: "policyNumber", type: "text" },
      { key: "startDate", type: "date" },
      { key: "endDate", type: "date" },
      { key: "cost", type: "number", step: "0.01", min: "0" },
      { key: "deductible", type: "number", step: "0.01", min: "0" },
      { key: "agentName", type: "text" },
      { key: "agentContact", type: "text" },
      { key: "minDriverAge", type: "number", step: "1", min: "16" },
      { key: "driverRestrictions", type: "textarea", wide: true },
      { key: "towingAssistance", type: "textarea", wide: true },
      { key: "notes", type: "textarea", wide: true },
    ],
  },
};

const emptyDraft = (config) =>
  Object.fromEntries(config.fields.map((field) => [field.key, field.fallback || ""]));

const draftFrom = (config, record) =>
  Object.fromEntries(config.fields.map((field) => [field.key, record[field.key] ?? ""]));

const PAYLOAD_NUMBERS = new Set(["feeAmount", "cost", "deductible", "minDriverAge"]);

const sameDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function RecordForm({ kind, config, vehicleId, record, onSaved, onCancel, onDirty }) {
  const { t } = useI18n();
  const editing = Boolean(record);
  const initial = useMemo(() => (record ? draftFrom(config, record) : emptyDraft(config)), [config, record]);
  const [draft, setDraft] = useState(initial);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const dirty = !sameDraft(draft, initial) || reason !== "";
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);

  const changedGuarded = editing
    ? config.guarded.filter((key) => initial[key] !== "" && draft[key] !== initial[key])
    : [];
  const needsReason = changedGuarded.length > 0;

  const submit = async (event) => {
    event.preventDefault();
    if (needsReason && !reason.trim()) {
      setErrors({ reason: t("vehicles.correctionNeedsReason") });
      return;
    }
    const payload = {};
    for (const field of config.fields) {
      if (field.addOnly && editing) continue;
      payload[field.key] = PAYLOAD_NUMBERS.has(field.key) && draft[field.key] !== "" ? Number(draft[field.key]) : draft[field.key];
    }
    if (needsReason) payload.reason = reason.trim();
    setSaving(true);
    const res = editing
      ? await config.api.update(vehicleId, record.id, payload)
      : await config.api.add(vehicleId, payload);
    setSaving(false);
    if (!res.ok) {
      setErrors(res.errors || {});
      return toast.warn(res.message);
    }
    toast.success(t("vehicles.recordSaved"));
    onDirty?.(false);
    onSaved(res.vehicle);
  };

  const idPrefix = `${kind}-${record?.id || "new"}`;
  return (
    <form className={styles.inlineForm} onSubmit={submit} noValidate>
      <div className={styles.formGrid}>
        {config.fields
          .filter((field) => !(field.addOnly && editing))
          .filter((field) => !field.showWhen || field.showWhen(draft))
          .map((field) => {
            const group = field.group;
            const options = group
              ? [
                  ...(field.blank ? [{ value: "", label: "—" }] : []),
                  ...Object.keys(t(`vehicles.${group}`, {})).map((key) => ({ value: key, label: t(`vehicles.${group}.${key}`) })),
                ]
              : undefined;
            return (
              <Field
                key={field.key}
                id={`${idPrefix}-${field.key}`}
                label={t(`vehicles.f.${field.labelKey || field.key}`)}
                type={field.type}
                options={options}
                value={draft[field.key]}
                onChange={(value) => setDraft((prev) => ({ ...prev, [field.key]: value }))}
                error={errors[field.key]}
                required={field.required}
                wide={field.wide}
                step={field.step}
                min={field.min}
              />
            );
          })}
        {needsReason && (
          <Field
            id={`${idPrefix}-reason`}
            label={t("vehicles.f.reason")}
            type="text"
            value={reason}
            onChange={setReason}
            error={errors.reason}
            required
            wide
            hint={t("vehicles.correctionNeedsReason")}
          />
        )}
      </div>
      <div className={styles.actionsRow}>
        <Button type="submit" loading={saving}>{t("vehicles.save")}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>{t("vehicles.cancel")}</Button>
      </div>
    </form>
  );
}

function RetireBox({ label, onConfirm, onCancel }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useMemo(() => `retire-${Math.random().toString(36).slice(2)}`, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!reason.trim()) return setError(t("vehicles.correctionNeedsReason"));
    setBusy(true);
    const res = await onConfirm(reason.trim());
    setBusy(false);
    if (res && !res.ok) setError(res.message);
  };

  return (
    <form className={styles.inlineForm} onSubmit={submit} noValidate>
      <Field id={id} label={t("vehicles.f.reason")} value={reason} onChange={setReason} error={error} required />
      <div className={styles.actionsRow}>
        <Button type="submit" variant="danger" loading={busy}>{label}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>{t("vehicles.cancel")}</Button>
      </div>
    </form>
  );
}

const factValue = (field, record, t) => {
  const value = record[field.key];
  if (value === "" || value === null || value === undefined) return "";
  if (field.type === "date") return formatDateOnly(value);
  if (field.group) return t(`vehicles.${field.group}.${value}`);
  return String(value);
};

function recordBadge(kind, record, t) {
  if (kind === "license") {
    if (record.status === "current") return <StatusBadge tone="info">{t("vehicles.current")}</StatusBadge>;
    return null;
  }
  if (kind === "policy") {
    return <StatusBadge tone={insuranceTone({ status: record.status, state: "ok" })}>{t(`vehicles.insuranceStatus.${record.status}`)}</StatusBadge>;
  }
  return record.result ? <StatusBadge tone={record.result === "passed" ? "success" : record.result === "failed" ? "danger" : "neutral"}>{t(`vehicles.testResult.${record.result}`)}</StatusBadge> : null;
}

function recordTitle(kind, record, t) {
  if (kind === "license") return formatDateOnly(record.validUntil) || "—";
  if (kind === "test") return formatDateOnly(record.testDate) || t(`vehicles.testResult.${record.result}`);
  return `${t(`vehicles.policyType.${record.type}`)} — ${record.insurer || ""}`;
}

// The official next test date, with its own correction form (reason required).
function NextTestDate({ vehicle, canEdit, onVehicle }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(vehicle.nextTestDate || "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const status = vehicle.summary.test;
  const hadValue = Boolean(vehicle.nextTestDate);

  const submit = async (event) => {
    event.preventDefault();
    if (hadValue && !reason.trim()) return setError(t("vehicles.correctionNeedsReason"));
    setSaving(true);
    const res = await setNextTestDate(vehicle._id, value, reason.trim());
    setSaving(false);
    if (!res.ok) return setError(res.errors?.nextTestDate || res.message);
    toast.success(t("vehicles.recordSaved"));
    setOpen(false);
    setReason("");
    setError("");
    onVehicle(res.vehicle);
  };

  return (
    <div className={styles.record}>
      <div className={styles.recordHead}>
        <strong>{t("vehicles.f.nextTestDate")}</strong>
        <StatusBadge tone={expiryTone(status)}>{expiryText(status, t("vehicles.expiry", {}))}</StatusBadge>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>{status.source === "retest" ? t("vehicles.f.retestDate") : t("vehicles.f.nextTestDate")}</dt>
          <dd>{formatDateOnly(status.dueDate) || t("vehicles.expiry.unknown")}</dd>
        </div>
      </dl>
      {canEdit && !open && (
        <div className={styles.actionsRow}>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{t("vehicles.setNextTest")}</Button>
        </div>
      )}
      {open && (
        <form className={styles.inlineForm} onSubmit={submit} noValidate>
          <div className={styles.formGrid}>
            <Field id="next-test-date" type="date" label={t("vehicles.f.nextTestDate")} value={value} onChange={setValue} />
            {hadValue && (
              <Field id="next-test-reason" label={t("vehicles.f.reason")} value={reason} onChange={setReason} required />
            )}
          </div>
          {error && <span className={styles.fieldError} role="alert">{error}</span>}
          <div className={styles.actionsRow}>
            <Button type="submit" loading={saving}>{t("vehicles.save")}</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t("vehicles.cancel")}</Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function VehicleRecords({ kind, vehicle, canEdit, canAccessDocs, canUploadDocs, onVehicle, onDirtyChange }) {
  const { t } = useI18n();
  const config = KINDS[kind];
  const [mode, setMode] = useState(null); // null | "add" | { edit: record } | { retire: record }
  const records = [...(vehicle[config.list] || [])].reverse();
  const archived = vehicle.status === "archived";
  const writable = canEdit && !archived;

  const saved = (next) => {
    setMode(null);
    onVehicle(next);
  };

  const dirtyKey = `${kind}-form`;
  const reportDirty = useMemo(() => (dirty) => onDirtyChange?.(dirtyKey, dirty), [onDirtyChange, dirtyKey]);

  return (
    <div className={styles.panel}>
      <AttachmentsBar
        vehicle={vehicle}
        linkedType={kind}
        defaultKind={kind}
        canAccess={canAccessDocs}
        canUpload={canUploadDocs && !archived}
        onVehicle={onVehicle}
      />
      <p className={styles.note}>{t(config.note)}</p>

      {kind === "test" && <NextTestDate vehicle={vehicle} canEdit={writable} onVehicle={onVehicle} />}

      {writable && mode === null && (
        <div className={styles.actionsRow}>
          <Button onClick={() => setMode("add")}>{t(config.addLabel)}</Button>
        </div>
      )}

      {mode === "add" && (
        <RecordForm
          kind={kind}
          config={config}
          vehicleId={vehicle._id}
          onSaved={saved}
          onCancel={() => setMode(null)}
          onDirty={reportDirty}
        />
      )}

      <h3>{t("vehicles.history")}</h3>
      {records.length === 0 && <p className={styles.fieldHint}>{t("vehicles.noRecords")}</p>}
      <ul className={styles.records}>
        {records.map((record) => {
          const retired = Boolean(record[config.retiredAt]);
          const isEditing = mode && mode.edit && mode.edit.id === record.id;
          const isRetiring = mode && mode.retire && mode.retire.id === record.id;
          return (
            <li
              key={record.id}
              className={`${styles.record} ${record.status === "current" ? styles.recordCurrent : ""} ${retired ? styles.recordRetired : ""}`}
            >
              <div className={styles.recordHead}>
                <strong>{recordTitle(kind, record, t)}</strong>
                <span>
                  {retired ? (
                    <StatusBadge tone="neutral">{fillText(t(config.retiredLabel), { date: formatDateOnly(record[config.retiredAt]) })}</StatusBadge>
                  ) : (
                    recordBadge(kind, record, t)
                  )}
                </span>
              </div>

              {!isEditing && (
                <dl className={styles.facts}>
                  {config.fields
                    .filter((field) => field.type !== "textarea" || record[field.key])
                    .map((field) => {
                      const text = factValue(field, record, t);
                      if (!text) return null;
                      return (
                        <div key={field.key}>
                          <dt>{t(`vehicles.f.${field.labelKey || field.key}`)}</dt>
                          <dd>{text}</dd>
                        </div>
                      );
                    })}
                </dl>
              )}

              {(record.corrections || []).map((correction, index) => (
                <p key={index} className={styles.correction}>
                  {fillText(t("vehicles.correctionLog"), {
                    from: formatDateOnly(correction.from) || correction.from,
                    to: formatDateOnly(correction.to) || correction.to,
                    reason: correction.reason,
                  })}
                </p>
              ))}
              {retired && record.voidReason && <p className={styles.correction}>{record.voidReason}</p>}
              {retired && record.cancelledReason && <p className={styles.correction}>{record.cancelledReason}</p>}

              {isEditing && (
                <RecordForm
                  kind={kind}
                  config={config}
                  vehicleId={vehicle._id}
                  record={record}
                  onSaved={saved}
                  onCancel={() => setMode(null)}
                  onDirty={reportDirty}
                />
              )}
              {isRetiring && (
                <RetireBox
                  label={t(config.retireLabel)}
                  onCancel={() => setMode(null)}
                  onConfirm={async (reason) => {
                    const res = await config.api.retire(vehicle._id, record.id, reason);
                    if (res.ok) {
                      toast.success(t("vehicles.recordSaved"));
                      saved(res.vehicle);
                    }
                    return res;
                  }}
                />
              )}

              {writable && !retired && !isEditing && !isRetiring && mode === null && (
                <div className={styles.actionsRow}>
                  <Button size="sm" variant="secondary" onClick={() => setMode({ edit: record })}>{t("vehicles.edit")}</Button>
                  <Button size="sm" variant="danger" onClick={() => setMode({ retire: record })}>{t(config.retireLabel)}</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
