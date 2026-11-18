// Codex review, 2026-11-18: nothing in the new PDFs may fall off a page.
jest.mock("jspdf", () => ({ jsPDF: function JsPDF() {} }));
jest.mock("html2canvas", () => jest.fn());
const { rulesParts, packRows } = require("./ExportPDF.jsx");

test("a long paragraph with no line breaks is cut into page-sized parts, losing nothing", () => {
  const words = Array.from({ length: 2000 }, (_, i) => `كلمة${i}`).join(" ");
  const parts = rulesParts(words);
  expect(parts.length).toBeGreaterThan(1);
  for (const part of parts) expect(part.length).toBeLessThanOrEqual(1400);
  expect(parts.join(" ").split(/\s+/)).toEqual(words.split(" "));
});

test("a long run with no spaces is cut too", () => {
  const parts = rulesParts("x".repeat(10000));
  expect(parts.map((p) => p.length)).toEqual([1400, 1400, 1400, 1400, 1400, 1400, 1400, 200]);
});

test("short lines still go together as before", () => {
  expect(rulesParts("a\nb\n\nc")).toEqual(["a\nb\n\nc"]);
});

test("rows fill a page by their height; tall rows move to the next page", () => {
  // First page has 100px under the header (the title takes room), the rest 150px.
  expect(packRows([40, 40, 40, 40, 40, 40], 100, 150)).toEqual([[0, 1], [2, 3, 4], [5]]);
  // A row taller than a page goes alone.
  expect(packRows([20, 500, 20], 100, 150)).toEqual([[0], [1], [2]]);
});

test("with nothing measured, ROWS_PER_PAGE rows per page; no rows is one empty page", () => {
  expect(packRows(new Array(30).fill(0), 0, 0).map((p) => p.length)).toEqual([24, 6]);
  expect(packRows([], 100, 150)).toEqual([[]]);
});

// Codex re-review, 2026-11-18.
const { splitTallSections, splitRow } = require("./ExportPDF.jsx");
// A fake page: every line of a section is 10px, the title 20px.
const fakeHeight = (sec) => 20 + sec.rows.reduce((n, r) => n + String(r.value ?? "").split("\n").length * 10, 0);

test("many short lines are cut by height into parts that fit a page", () => {
  const text = Array.from({ length: 100 }, (_, i) => `قانون ${i}`).join("\n");
  const parts = splitTallSections([{ title: "قوانين الجمعية", rows: [{ key: "", value: text, full: true, pre: true }] }], fakeHeight, 220);
  expect(parts.length).toBe(5);
  for (const part of parts) expect(fakeHeight(part)).toBeLessThanOrEqual(220);
  expect(parts.map((p) => p.rows[0].value).join("\n")).toBe(text);
  expect(parts[0].title).toBe("قوانين الجمعية");
  expect(parts[1].title).toBe("قوانين الجمعية (تابع)");
  // A title that already says (تابع) is not doubled.
  const again = splitTallSections([{ title: "قوانين الجمعية (تابع)", rows: [{ key: "", value: text }] }], fakeHeight, 220);
  expect(again[1].title).toBe("قوانين الجمعية (تابع)");
});

test("a section of many rows is cut between rows; sections that fit, and nothing measured, stay as they are", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ key: `k${i}`, value: "v" }));
  const parts = splitTallSections([{ title: "T", rows }], fakeHeight, 120);
  expect(parts.map((p) => p.rows.length)).toEqual([10, 10, 10]);
  const small = [{ title: "S", rows: [{ key: "a", value: "b" }] }];
  expect(splitTallSections(small, fakeHeight, 120)).toEqual(small);
  expect(splitTallSections([{ title: "T", rows }], () => 0, 0)).toEqual([{ title: "T", rows }]);
});

test("a first row too tall for the first page starts on the next, leaving the title alone", () => {
  expect(packRows([800], 700, 900)).toEqual([[], [0]]);
  expect(packRows([800, 50], 700, 900)).toEqual([[], [0, 1]]);
  // Taller than every page: it goes on the first page alone (exportTablePdf cuts it first).
  expect(packRows([1000], 700, 900)).toEqual([[0]]);
});

test("a row taller than a page is cut into rows, losing no text", () => {
  const name = Array.from({ length: 60 }, (_, i) => `اسم${i}`).join(" ");
  const parts = splitRow([name, "05", ""], 3);
  expect(parts.length).toBe(3);
  expect(parts.map((r) => r[0]).join(" ")).toBe(name);
  expect(parts.map((r) => r[1])).toEqual(["05", "", ""]);
  expect(splitRow(["a", "b"], 1)).toEqual([["a", "b"]]);
});

// Codex second re-review, 2026-11-18.
const { fitRows } = require("./ExportPDF.jsx");

test("one very long word with no spaces is cut by its characters, each part fitting", () => {
  // A fake page: 10 characters per line, 10px a line, the title 20px.
  const height = (sec) => 20 + sec.rows.reduce((n, r) => n + String(r.value ?? "").split("\n").reduce((k, l) => k + Math.max(1, Math.ceil(l.length / 10)), 0) * 10, 0);
  const word = "ب".repeat(1400);
  const parts = splitTallSections([{ title: "قوانين الجمعية", rows: [{ key: "", value: word, pre: true }] }], height, 220);
  expect(parts.length).toBeGreaterThan(1);
  for (const part of parts) expect(height(part)).toBeLessThanOrEqual(220);
  expect(parts.map((p) => p.rows[0].value).join("")).toBe(word);
});

test("every row is kept however many rounds of cutting it takes", () => {
  // Each cell character is 1px tall; a later page has 100px.
  const measure = (rows) => ({ heights: rows.map((r) => Math.max(...r.map((c) => String(c).length))), firstRoom: 80, nextRoom: 100 });
  const rows = [["a".repeat(900), "x"], ["short", "y"], ["b ".repeat(300).trim(), "z"]];
  const { body, heights } = fitRows(rows, measure);
  expect(heights).toEqual(measure(body).heights);
  for (const h of heights) expect(h).toBeLessThanOrEqual(100);
  expect(body.map((r) => r[0]).join("").replace(/ /g, "")).toBe(rows.map((r) => r[0]).join("").replace(/ /g, ""));
  expect(body.map((r) => r[1]).filter(Boolean)).toEqual(["x", "y", "z"]);
  const pages = packRows(heights, 80, 100);
  expect(pages.flat()).toEqual(body.map((_, i) => i));
});

test("a row that cannot be cut any more stops the rounds; nothing is lost", () => {
  const measure = (rows) => ({ heights: rows.map(() => 500), firstRoom: 80, nextRoom: 100 });
  const { body, heights } = fitRows([["x", "y"]], measure);
  expect(body).toEqual([["x", "y"]]);
  expect(heights).toEqual([500]);
});
