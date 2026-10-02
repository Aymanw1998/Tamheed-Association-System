// Display helpers for the vehicles & trailers pages. Pure functions: the server
// decides what is expired, due or unknown (summary.* on each vehicle); this
// file only turns that into text, colours, filters and counts.

export const fillText = (template, values = {}) =>
  String(template ?? "").replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );

// "2026-10-02" -> "02/10/2026". Date-only text is never parsed into a Date, so
// the day cannot shift with the viewer's timezone.
export const formatDateOnly = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

// A stored instant (ISO, UTC) shown on the Asia/Jerusalem calendar, as
// "02/10/2026 14:05", so late-evening entries do not land on the wrong day.
export const formatInstant = (value) => {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(time));
  const pick = (type) => parts.find((part) => part.type === type).value;
  return `${pick("day")}/${pick("month")}/${pick("year")} ${pick("hour")}:${pick("minute")}`;
};

export const instantDate = (value) => formatInstant(value).slice(0, 10);

export const normalizePlateInput = (value) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[\s\-.‎‏]/g, "");

// Israeli plates are 7 or 8 digits and are read in groups (12-345-67 / 123-45-678).
export const formatPlate = (plate) => {
  const value = String(plate || "");
  if (/^\d{7}$/.test(value)) return `${value.slice(0, 2)}-${value.slice(2, 5)}-${value.slice(5)}`;
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 3)}-${value.slice(3, 5)}-${value.slice(5)}`;
  return value;
};

// Text for one expiry status ({ state, daysLeft }). `labels` is t("vehicles.expiry").
export const expiryText = (status = {}, labels = {}) => {
  if (status.state === "expired") {
    const days = -Number(status.daysLeft);
    return days <= 1 ? labels.expiredToday : fillText(labels.expired, { n: days });
  }
  if (status.state === "due" || status.state === "ok") {
    return Number(status.daysLeft) === 0 ? labels.today : fillText(labels.inDays, { n: status.daysLeft });
  }
  return labels.unknown;
};

// Missing information is never green: unknown stays neutral/warning.
export const expiryTone = (status = {}) => {
  if (status.state === "expired") return "danger";
  if (status.state === "due") return status.bucket <= 14 ? "danger" : "warning";
  if (status.state === "ok") return "success";
  return "neutral";
};

export const insuranceTone = (insurance = {}) => {
  switch (insurance.status) {
    case "active":
      return expiryTone(insurance);
    case "expired":
      return "danger";
    case "future":
      return "info";
    case "cancelled":
      return "neutral";
    default:
      return "warning";
  }
};

export const documentIssues = (vehicle = {}) => {
  const items = [vehicle.summary?.license, vehicle.summary?.test, vehicle.summary?.insurance].filter(Boolean);
  return {
    expired: items.some((item) => item.state === "expired"),
    soon: items.some((item) => item.state === "due"),
    unknown: items.some((item) => item.state === "unknown"),
  };
};

const matchesSearch = (vehicle, query) => {
  const text = String(query || "").trim().toLowerCase();
  if (!text) return true;
  const plateQuery = normalizePlateInput(text);
  if (plateQuery && String(vehicle.plate || "").toUpperCase().includes(plateQuery)) return true;
  return [vehicle.nickname, vehicle.make, vehicle.model, vehicle.responsibleName]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(text));
};

// Archived vehicles are hidden unless that status is chosen explicitly.
export const filterVehicles = (vehicles = [], { search = "", type = "all", status = "all", docs = "all" } = {}) =>
  vehicles.filter((vehicle) => {
    if (!matchesSearch(vehicle, search)) return false;
    if (type !== "all" && vehicle.type !== type) return false;
    if (status === "all" ? vehicle.status === "archived" : vehicle.status !== status) return false;
    if (docs !== "all") {
      const issues = documentIssues(vehicle);
      if (docs === "attention" && !(issues.expired || issues.soon)) return false;
      if (docs === "expired" && !issues.expired) return false;
      if (docs === "soon" && !issues.soon) return false;
      if (docs === "unknown" && !issues.unknown) return false;
    }
    return true;
  });

export const countVehicles = (vehicles = []) => {
  const live = vehicles.filter((vehicle) => vehicle.status !== "archived");
  const issues = live.map(documentIssues);
  return {
    total: live.length,
    active: live.filter((vehicle) => vehicle.status === "active").length,
    expired: issues.filter((item) => item.expired).length,
    soon: issues.filter((item) => item.soon).length,
    unknown: issues.filter((item) => item.unknown).length,
  };
};

// "name (last 4 of ID)" so two people with the same name can be told apart.
export const personOptionLabel = (person = {}) =>
  person.tzSuffix ? `${person.name} (${person.tzSuffix})` : person.name || "";

const LOOKUP_FIELDS = ["make", "model", "year", "color", "chassisNumber"];

const sameText = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

// Turns an official proposal into reviewable rows. A row is ticked by default
// only when it fills an empty field; when it would replace a value someone
// entered it stays unticked, so documented data is never overwritten silently.
export const buildSuggestions = (form = {}, proposed = {}) =>
  LOOKUP_FIELDS.filter((field) => proposed[field] !== "" && proposed[field] !== undefined && proposed[field] !== null)
    .filter((field) => !sameText(form[field], proposed[field]))
    .map((field) => {
      const current = form[field] ?? "";
      const conflict = String(current).trim() !== "";
      return { field, current, official: proposed[field], conflict, defaultChecked: !conflict };
    });

// The name a downloaded file gets: "<plate> - <your name or the document type>.<ext>".
// The stored name is only an internal id (plate_kind_timestamp); the extension is
// taken from it so the file still opens, and characters Windows forbids are removed.
export const buildDownloadName = ({ title = "", kindLabel = "", plate = "", storedName = "" }) => {
  const ext = (/\.[A-Za-z0-9]{1,5}$/.exec(String(storedName)) || [""])[0].toLowerCase();
  const clean = (text) =>
    String(text)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/, "");
  const label = clean(title) || clean(kindLabel) || "document";
  const prefix = clean(plate);
  const base = prefix ? `${prefix} - ${label}` : label;
  return `${base.slice(0, 120)}${ext}`;
};
