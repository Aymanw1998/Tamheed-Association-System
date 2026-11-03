import { passportSrc, pdfPhoto } from "./passportPhoto";

test("a Drive photo link becomes its passport address", () => {
  expect(passportSrc("https://lh3.googleusercontent.com/d/1AbC-def_ghij")).toBe("/api/photos/passport/1AbC-def_ghij");
  expect(passportSrc("https://drive.google.com/uc?export=download&id=1AbC-def_ghij")).toBe("/api/photos/passport/1AbC-def_ghij");
  expect(passportSrc("https://drive.google.com/file/d/1AbC-def_ghij/view")).toBe("/api/photos/passport/1AbC-def_ghij");
});

test("anything else comes back unchanged", () => {
  const file = new File(["x"], "a.jpg");
  expect(passportSrc(file)).toBe(file);
  expect(passportSrc(null)).toBe(null);
  expect(passportSrc("")).toBe("");
  expect(passportSrc("blob:http://localhost/123")).toBe("blob:http://localhost/123");
  expect(passportSrc("https://evil.example/d/1AbC-def_ghij")).toBe("https://evil.example/d/1AbC-def_ghij");
  expect(passportSrc("https://lh3.googleusercontent.com/d/short")).toBe("https://lh3.googleusercontent.com/d/short");
});

test("a PDF gets the passport version inline, or the link when it cannot be fetched", async () => {
  const link = "https://lh3.googleusercontent.com/d/1AbC-def_ghij";
  global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["jpg"], { type: "image/jpeg" }) });
  expect(await pdfPhoto(link)).toMatch(/^data:image\/jpeg;base64,/);
  expect(global.fetch).toHaveBeenCalledWith("/api/photos/passport/1AbC-def_ghij");
  global.fetch = jest.fn().mockRejectedValue(new TypeError("cors"));
  expect(await pdfPhoto(link)).toBe(link);
  expect(await pdfPhoto("")).toBe("");
  expect(await pdfPhoto(null)).toBe(null);
});
