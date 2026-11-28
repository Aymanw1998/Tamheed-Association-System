// The list's PDF (owner, 2026-11-27): A4, right to left, the heading first,
// then each nasheed with its number, title and lines; a nasheed that fits on a
// page is never split. Sharing opens the phone's share sheet, else downloads.
import { layoutPages, splitRows, buildNasheedPdf, sharePdf, pdfFileName, PAGE } from "./pdf";
import html2canvas from "html2canvas";

jest.mock("html2canvas", () => jest.fn());
// A plain class: CRA resets jest.fn implementations before every test.
jest.mock("jspdf", () => {
  const docs = [];
  class jsPDF {
    constructor() {
      this.addPage = jest.fn();
      this.addImage = jest.fn();
      docs.push(this);
    }
    output() { return new Blob(["%PDF"], { type: "application/pdf" }); }
  }
  return { jsPDF, docs };
});

afterEach(() => { jest.clearAllMocks(); require("jspdf").docs.length = 0; document.body.innerHTML = ""; });

test("layoutPages keeps a block that fits whole on one page and moves it to the next page when it does not fit", () => {
  expect(layoutPages([300, 300, 300], 1000)).toEqual([[0, 1, 2]]);
  expect(layoutPages([600, 600, 300], 1000)).toEqual([[0], [1, 2]]);
});

test("layoutPages gives a block taller than a page its own page and drops none", () => {
  const result = layoutPages([200, 2500, 200], 1000);
  expect(result).toEqual([[0], [1], [2]]);
  expect(result.flat().sort()).toEqual([0, 1, 2]);
  expect(layoutPages([], 1000)).toEqual([]);
});

test("buildNasheedPdf draws the heading and the nasheeds in order, right to left, and cleans up", async () => {
  let seen = "";
  html2canvas.mockImplementation(async (el) => {
    seen += el.textContent;
    expect(el.getAttribute("dir")).toBe("rtl");
    expect(el.style.width).toBe(`${PAGE.width}px`);
    return { width: PAGE.width * 2, height: 400, toDataURL: () => "data:image/png;base64,AAAA" };
  });
  const blob = await buildNasheedPdf({
    heading: "حفل الختام",
    nasheeds: [
      { title: "الثاني", lines: [{ kind: "verse", sadr: "صدر", ajuz: "عجز" }] },
      { title: "الأول", lines: [{ kind: "center", text: "الله الله" }] },
    ],
  });
  expect(blob.type).toBe("application/pdf");
  // The number is its own box, first in a right-to-left row: on the right.
  expect(seen.indexOf("حفل الختام")).toBeLessThan(seen.indexOf("1.الثاني"));
  expect(seen.indexOf("1.الثاني")).toBeLessThan(seen.indexOf("2.الأول"));
  expect(document.querySelector("[data-pdf-root]")).toBeNull();
});

test("a page drawn taller than A4 continues onto the next pages and no slice is lost", async () => {
  html2canvas.mockImplementation(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE.width;
    canvas.height = Math.round(PAGE.height * 2.5);
    canvas.getContext = () => ({ drawImage: jest.fn() });
    canvas.toDataURL = () => "data:image/png;base64,AAAA";
    return canvas;
  });
  await buildNasheedPdf({ heading: "", nasheeds: [{ title: "طويل", lines: [{ kind: "center", text: "س" }] }] });
  const [doc] = require("jspdf").docs;
  expect(doc.addImage).toHaveBeenCalledTimes(3);
  expect(doc.addImage.mock.calls[0][1]).toBe("JPEG");
  expect(doc.addPage).toHaveBeenCalledTimes(2);
});

// A nasheed longer than a page (owner, 2026-11-28): drawn as one tall picture
// it can exceed the iPhone's canvas limit and come out blank, so its lines go
// on as many pages as they need, each page no taller than A4.
test("a nasheed longer than a page is split by lines: every page fits A4, every line once, the title once", async () => {
  const ROW = 100;
  const TITLE_H = 50;
  const height = (el) => {
    if (el.classList.contains("nl-row")) return ROW;
    if (el.tagName === "H2") return TITLE_H;
    if (el.hasAttribute("data-block")) return (el.querySelector("h2") ? TITLE_H : 0) + el.querySelectorAll(".nl-row").length * ROW;
    return 0;
  };
  const spy = jest.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function get() { return height(this); });
  const pages = [];
  html2canvas.mockImplementation(async (el) => {
    pages.push({
      rows: [...el.querySelectorAll(".nl-row")].map((r) => r.textContent),
      titles: el.querySelectorAll("h2").length,
      height: [...el.children].reduce((sum, c) => sum + height(c), 0),
    });
    return { width: PAGE.width * 2, height: PAGE.height * 2, toDataURL: () => "data:image/jpeg;base64,AAAA" };
  });
  const lines = Array.from({ length: 40 }, (_, i) => ({ kind: "center", text: `سطر ${i + 1}` }));
  await buildNasheedPdf({ heading: "", nasheeds: [{ title: "طويل جدًا", lines }] });
  spy.mockRestore();

  expect(pages.length).toBeGreaterThan(3);
  pages.forEach((p) => expect(p.height).toBeLessThanOrEqual(PAGE.height - 2 * PAGE.margin));
  expect(pages.flatMap((p) => p.rows)).toEqual(lines.map((l) => l.text));
  expect(pages.reduce((n, p) => n + p.titles, 0)).toBe(1);
  expect(pages[0].titles).toBe(1);
  // One drawn A4 page per PDF page: nothing is drawn taller than a page.
  const [doc] = require("jspdf").docs;
  expect(doc.addImage).toHaveBeenCalledTimes(pages.length);
});

// Seen in the browser (2026-11-28): a page measured a few pixels short came
// out a hair taller than A4 and added a blank page. What spills past A4 by
// less than the bottom margin is the margin's own white space.
test("a page a hair taller than A4 (within the bottom margin) stays one page, no blank page after it", async () => {
  html2canvas.mockImplementation(async () => ({
    width: PAGE.width * 2,
    height: Math.round((PAGE.height + PAGE.margin / 2) * 2),
    toDataURL: () => "data:image/jpeg;base64,AAAA",
  }));
  await buildNasheedPdf({ heading: "", nasheeds: [{ title: "س", lines: [{ kind: "center", text: "س" }] }] });
  const [doc] = require("jspdf").docs;
  expect(doc.addImage).toHaveBeenCalledTimes(1);
  expect(doc.addPage).not.toHaveBeenCalled();
});

// The owner, 2026-11-28: every nasheed in the list starts on a page of its
// own; the list's heading sits on the first page, above the first nasheed.
test("layoutPages with groups starts every nasheed on a new page and keeps the heading with the first", () => {
  // heading (-1), nasheed 0, nasheed 1, nasheed 2 split in two pieces
  expect(layoutPages([50, 100, 100, 900, 300], 1000, [-1, 0, 1, 2, 2])).toEqual([[0, 1], [2], [3], [4]]);
  expect(layoutPages([100, 100], 1000, [0, 1])).toEqual([[0], [1]]);
});

test("the PDF puts each nasheed on its own page, the heading on the first", async () => {
  const pages = [];
  html2canvas.mockImplementation(async (el) => {
    pages.push(el.textContent);
    return { width: PAGE.width * 2, height: 400, toDataURL: () => "data:image/jpeg;base64,AAAA" };
  });
  await buildNasheedPdf({
    heading: "حفل الختام",
    nasheeds: [
      { title: "الأول", lines: [{ kind: "center", text: "سطر أ" }] },
      { title: "الثاني", lines: [{ kind: "center", text: "سطر ب" }] },
      { title: "الثالث", lines: [{ kind: "center", text: "سطر ج" }] },
    ],
  });
  expect(pages).toHaveLength(3);
  expect(pages[0]).toContain("حفل الختام");
  expect(pages[0]).toContain("الأول");
  expect(pages[1]).toContain("الثاني");
  expect(pages[1]).not.toContain("الأول");
  expect(pages[2]).toContain("الثالث");
});

test("splitRows puts the title with the first lines, keeps every group within the page and drops no line", () => {
  expect(splitRows([100, 100, 100, 100], 150, 400)).toEqual([[0, 1], [2, 3]]);
  expect(splitRows([100, 900, 100], 0, 400)).toEqual([[0], [1], [2]]);
  expect(splitRows([], 50, 400)).toEqual([]);
});

test("share opens the share sheet when the phone can share files", async () => {
  const share = jest.fn(() => Promise.resolve());
  Object.assign(navigator, { canShare: () => true, share });
  expect(await sharePdf(new Blob(["x"]), "أناشيد.pdf")).toBe("shared");
  expect(share.mock.calls[0][0].files[0].name).toBe("أناشيد.pdf");
});

test("share cancelled (AbortError) answers cancelled and does not download", async () => {
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  Object.assign(navigator, { canShare: () => true, share: jest.fn(() => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" }))) });
  expect(await sharePdf(new Blob(["x"]), "a.pdf")).toBe("cancelled");
  expect(click).not.toHaveBeenCalled();
  click.mockRestore();
});

test("no share support downloads the file", async () => {
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  URL.createObjectURL = jest.fn(() => "blob:x");
  URL.revokeObjectURL = jest.fn();
  Object.assign(navigator, { canShare: undefined, share: undefined });
  expect(await sharePdf(new Blob(["x"]), "a.pdf")).toBe("downloaded");
  expect(click).toHaveBeenCalled();
  click.mockRestore();
});

test("the file name comes from the heading, or the date, and is safe", () => {
  expect(pdfFileName("حفل / الختام", new Date("2026-11-27T10:00:00Z"))).toBe("أناشيد - حفل - الختام.pdf");
  expect(pdfFileName("", new Date("2026-11-27T10:00:00Z"))).toBe("أناشيد - 27-11-2026.pdf");
});
