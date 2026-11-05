// The reports list's filter: dates, the writer, and the titles by a part of them.
export const EMPTY_REPORT_FILTERS = { dateFrom: "", dateTo: "", createBy: "", stitle: "", title: "" };

const has = (text, part) => String(text ?? "").toLowerCase().includes(part.trim().toLowerCase());

// Both days count whole, in the viewer's own day: a report written at 18:00 on the
// last day is inside the range.
export function matchesReportFilters(report, filters, dateOf) {
  const { dateFrom, dateTo, createBy, stitle, title } = filters;
  if (dateFrom || dateTo) {
    const date = dateOf(report.date);
    if (!date) return false;
    if (dateFrom && date < new Date(`${dateFrom}T00:00:00`)) return false;
    if (dateTo && date > new Date(`${dateTo}T23:59:59.999`)) return false;
  }
  if (stitle.trim() && !has(report.stitle, stitle)) return false;
  if (title.trim() && !has((report.title ?? []).join(" "), title)) return false;
  if (createBy.trim()) {
    const owner = report.user ? `${report.user.firstname ?? ""} ${report.user.lastname ?? ""}` : "";
    if (!has(owner, createBy)) return false;
  }
  return true;
}

export const countReportFilters = (filters) => Object.values(filters).filter((value) => String(value).trim()).length;
