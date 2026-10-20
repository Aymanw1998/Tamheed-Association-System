const { FORBIDDEN, fullName, rows, byName } = require("./_shared");

const MAX = 20;
const inScope = (visible, s) => !visible || visible.has(String(s._id));

// Students the user may see (students.view + scope, like GET /api/students),
// matched by name or school, or by the exact full ID number. No ID numbers or
// phones in the result.
module.exports = {
  name: "search_students",
  description: "Search the students the user may see by name or school (partial match), or by an exact full ID number. "
    + "An empty q lists them all. Returns at most 20: id, name, school, layer, status, plus the total number of matches. "
    + "Use get_student with the id for details.",
  input_schema: {
    type: "object",
    properties: { q: { type: "string", maxLength: 100, description: "Name, school or exact ID number; empty for all." } },
    required: ["q"],
    additionalProperties: false,
  },
  async run({ q }, ctx) {
    if (!ctx.can("students.view")) return FORBIDDEN;
    const visible = await ctx.visible();
    const term = q.trim().toLowerCase();
    const matches = rows(await ctx.models.Student.get({}))
      .filter((s) => inScope(visible, s) && !ctx.isSystemTz(s.tz))
      .filter((s) => {
        if (!term) return true;
        if (String(s.tz ?? "").trim() === q.trim()) return true;
        const names = [fullName(s), `${s.lastname || ""} ${s.firstname || ""}`, s.school || ""];
        return names.some((n) => String(n).toLowerCase().includes(term));
      })
      .map((s) => ({ id: String(s._id), name: fullName(s), school: s.school || "", layer: s.layer || "", status: s.status || "" }))
      .sort(byName);
    return { total: matches.length, students: matches.slice(0, MAX) };
  },
};
