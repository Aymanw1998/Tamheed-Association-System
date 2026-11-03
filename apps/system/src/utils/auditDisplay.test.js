import { formatValue, changeRows, auditQuery } from "./auditDisplay";

test("formatValue renders empty, arrays, objects and dates readably", () => {
  expect(formatValue(undefined)).toBe("—");
  expect(formatValue(null)).toBe("—");
  expect(formatValue("")).toBe("—");
  expect(formatValue(["a", "b"])).toBe("a, b");
  expect(formatValue({ a: 1 })).toBe('{"a":1}');
  expect(formatValue(5)).toBe("5");
});

test("changeRows lists each field with before and after", () => {
  expect(changeRows({ firstname: { before: "A", after: "B" } })).toEqual([
    { field: "firstname", before: "A", after: "B" },
  ]);
  expect(changeRows(null)).toEqual([]);
});

test("lesson roster diffs show names when known, ids otherwise", () => {
  const names = new Map([["s1", "Dana Levi"]]);
  const rows = changeRows({ list_students: { before: ["s1"], after: ["s1", "s2"] } }, { studentNames: names });
  expect(rows).toEqual([{ field: "list_students", before: "Dana Levi", after: "Dana Levi, s2" }]);
});

test("auditQuery drops empty filters and keeps the page", () => {
  expect(auditQuery({ from: "2026-01-01", to: "", module: "users", actor: " ", q: "x" }, 2))
    .toEqual({ from: "2026-01-01", module: "users", q: "x", page: 2 });
});
