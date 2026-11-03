import { showPdfPreview } from "./pdfPreview";
import { startDemo, stopDemo } from "../../journey/demoMode";

const overlay = () => document.querySelector(".pdfpv-overlay");
const buttons = () => Array.from(overlay().querySelectorAll("button")).map((b) => b.textContent);
const open = () => showPdfPreview({ pdf: { save: jest.fn() }, images: ["data:image/png;base64,"], fileName: "f.pdf", title: "t" });

afterEach(() => {
  stopDemo();
  document.body.innerHTML = "";
});

test("outside training, download and print are offered", () => {
  open();
  expect(buttons()).toEqual(["تنزيل PDF", "طباعة", "إغلاق"]);
});

test("in training, the preview has no download or print", () => {
  startDemo();
  open();
  expect(buttons()).toEqual(["إغلاق"]);
});

test("the preview closes when training mode toggles", () => {
  startDemo();
  open();
  stopDemo();
  expect(overlay()).toBeNull();
  open();
  startDemo();
  expect(overlay()).toBeNull();
});

describe("print", () => {
  const ua = navigator.userAgent;
  const setUA = (value) => Object.defineProperty(navigator, "userAgent", { value, configurable: true });
  const pdf = { save: jest.fn(), output: jest.fn(() => new Blob(["%PDF"], { type: "application/pdf" })) };
  const clickPrint = () => {
    showPdfPreview({ pdf, images: ["data:image/png;base64,"], fileName: "f.pdf", title: "t" });
    overlay().querySelector(".pdfpv-print").click();
  };

  afterEach(() => {
    setUA(ua);
    delete navigator.share;
    delete navigator.canShare;
  });

  test("on iPhone the PDF goes to the share sheet, which offers Print", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    navigator.share = jest.fn(() => Promise.resolve());
    navigator.canShare = jest.fn(() => true);
    clickPrint();
    expect(navigator.share).toHaveBeenCalledTimes(1);
    const [file] = navigator.share.mock.calls[0][0].files;
    expect(file.name).toBe("f.pdf");
    expect(file.type).toBe("application/pdf");
    expect(document.querySelector("iframe")).toBeNull();
  });

  test("on iPhone without file sharing, it falls back to the print frame", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    navigator.share = jest.fn(() => Promise.resolve());
    navigator.canShare = jest.fn(() => false);
    clickPrint();
    expect(navigator.share).not.toHaveBeenCalled();
    expect(document.querySelector("iframe")).not.toBeNull();
  });

  test("on iPhone without canShare, it does not trust share with files", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    navigator.share = jest.fn(() => Promise.resolve());
    clickPrint();
    expect(navigator.share).not.toHaveBeenCalled();
    expect(document.querySelector("iframe")).not.toBeNull();
  });

  test.each([
    ["AbortError", 0],
    ["NotAllowedError", 1],
    ["DataError", 1],
  ])("a share that fails with %s shows %i message(s)", async (name, alerts) => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    const alert = jest.spyOn(window, "alert").mockImplementation(() => {});
    navigator.share = jest.fn(() => Promise.reject(Object.assign(new Error(name), { name })));
    navigator.canShare = jest.fn(() => true);
    clickPrint();
    await Promise.resolve();
    await Promise.resolve();
    expect(alert).toHaveBeenCalledTimes(alerts);
    alert.mockRestore();
  });

  test("elsewhere it prints through the hidden frame", () => {
    navigator.share = jest.fn(() => Promise.resolve());
    clickPrint();
    expect(navigator.share).not.toHaveBeenCalled();
    expect(document.querySelector("iframe")).not.toBeNull();
  });
});

test("the preview's texts can be given in another language; Arabic by default", () => {
  showPdfPreview({
    pdf: { save: jest.fn() },
    images: ["data:image/png;base64,"],
    fileName: "f.pdf",
    title: "t",
    labels: { download: "הורדת PDF", print: "הדפסה", close: "סגירה", dialog: "תצוגה", page: (n, t) => `עמוד ${n} מתוך ${t}` },
  });
  expect(buttons()).toEqual(["הורדת PDF", "הדפסה", "סגירה"]);
  expect(overlay().getAttribute("aria-label")).toBe("תצוגה");
  expect(overlay().querySelector("img").alt).toBe("עמוד 1 מתוך 1");
  document.body.innerHTML = "";
  open();
  expect(buttons()).toEqual(["تنزيل PDF", "طباعة", "إغلاق"]);
  expect(overlay().querySelector("img").alt).toBe("صفحة 1 من 1");
});
