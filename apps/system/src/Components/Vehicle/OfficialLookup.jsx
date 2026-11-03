import React, { useState } from "react";
import { lookupOfficial } from "../../WebServer/services/vehicle/functionsVehicle.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import Button from "../UI/Button.jsx";
import { buildSuggestions, fillText, instantDate, normalizePlateInput } from "../../utils/vehicleDisplay";
import styles from "./Vehicle.module.css";

// Optional helper next to the plate field. It fetches a PROPOSAL from the
// official dataset; the user ticks the fields to take, and they land in the
// form like any typed value (saved only with "save"). Fields that already hold
// a value are never replaced unless explicitly ticked.
export default function OfficialLookup({ form, onApply }) {
  const { t } = useI18n();
  const [state, setState] = useState({ status: "idle", message: "", proposal: null });
  const [selected, setSelected] = useState({});

  const plate = normalizePlateInput(form.plate);
  const canSearch = /^\d{5,8}$/.test(plate);
  const suggestions = state.proposal ? buildSuggestions(form, state.proposal.proposed) : [];

  const search = async () => {
    setState({ status: "loading", message: "", proposal: null });
    const res = await lookupOfficial(plate);
    if (!res.ok) return setState({ status: "message", message: res.message, proposal: null });
    if (!res.available || !res.found) return setState({ status: "message", message: res.message, proposal: null });
    const rows = buildSuggestions(form, res.proposal.proposed);
    setSelected(Object.fromEntries(rows.map((row) => [row.field, row.defaultChecked])));
    setState({ status: "found", message: "", proposal: res.proposal });
  };

  const apply = () => {
    const chosen = suggestions.filter((row) => selected[row.field]);
    if (chosen.length === 0) return;
    onApply(
      Object.fromEntries(chosen.map((row) => [row.field, String(row.official)])),
      { name: "data.gov.il", fetchedAt: state.proposal.fetchedAt, fields: chosen.map((row) => row.field) }
    );
    toast.success(fillText(t("vehicles.lookup.applied"), { n: chosen.length }));
    setState({ status: "idle", message: "", proposal: null });
  };

  const info = state.proposal ? Object.entries(state.proposal.informational || {}) : [];

  return (
    <div className={`${styles.wide}`}>
      <div className={styles.actionsRow}>
        <Button type="button" variant="secondary" size="sm" disabled={!canSearch} loading={state.status === "loading"} onClick={search}>
          {t("vehicles.lookup.button")}
        </Button>
        <span className={styles.fieldHint}>{canSearch ? t("vehicles.lookup.manualHint") : t("vehicles.lookup.needPlate")}</span>
      </div>

      {state.status === "message" && <p className={styles.note} role="status">{state.message}</p>}

      {state.status === "found" && (
        <div className={styles.inlineForm} role="region" aria-label={t("vehicles.lookup.title")}>
          <strong>{t("vehicles.lookup.title")}</strong>
          <span className={styles.fieldHint}>
            {fillText(t("vehicles.lookup.source"), { date: instantDate(state.proposal.fetchedAt) })}
          </span>

          {suggestions.length === 0 ? (
            <p className={styles.fieldHint}>{t("vehicles.lookup.noChanges")}</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col">{t("vehicles.lookup.current")}</th>
                  <th scope="col">{t("vehicles.lookup.official")}</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((row) => {
                  const id = `lookup-${row.field}`;
                  return (
                    <tr key={row.field}>
                      <td>
                        <input
                          id={id}
                          type="checkbox"
                          checked={Boolean(selected[row.field])}
                          onChange={(event) => setSelected((prev) => ({ ...prev, [row.field]: event.target.checked }))}
                        />{" "}
                        <label htmlFor={id}>{t(`vehicles.f.${row.field === "chassisNumber" ? "chassisNumber" : row.field}`)}</label>
                      </td>
                      <td>{row.current || "—"}</td>
                      <td>
                        <strong>{String(row.official)}</strong>
                        {row.conflict && <span className={styles.sub}>{t("vehicles.lookup.conflict")}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {info.length > 0 && (
            <>
              <strong>{t("vehicles.lookup.infoTitle")}</strong>
              <p className={styles.fieldHint}>{t("vehicles.lookup.infoNote")}</p>
              <dl className={styles.facts}>
                {info.map(([key, value]) => (
                  <div key={key}>
                    <dt dir="ltr">{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          <div className={styles.actionsRow}>
            <Button type="button" size="sm" onClick={apply} disabled={!suggestions.some((row) => selected[row.field])}>
              {t("vehicles.lookup.apply")}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setState({ status: "idle", message: "", proposal: null })}>
              {t("vehicles.lookup.close")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
