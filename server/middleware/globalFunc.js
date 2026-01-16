function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);

    if (typeof value === 'string') {
        const s = value.trim();

        // dd-mm-yyyy או dd/mm/yyyy
        let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
        if (m) {
        const [, dd, mm, yyyy] = m.map(Number);
        return new Date(Date.UTC(yyyy, mm - 1, dd)); // UTC כדי להימנע מהפתעות שעון קיץ
        }

        // yyyy-mm-dd (ISO קצר)
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) {
        const [, yyyy, mm, dd] = m.map(Number);
        return new Date(Date.UTC(yyyy, mm - 1, dd));
        }

        const ts = Date.parse(s);
        if (!Number.isNaN(ts)) return new Date(ts);
    }
    return null; // לא תקין
}