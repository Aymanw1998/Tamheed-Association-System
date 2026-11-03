import {
  photoPlan, redrawSize, preparePhoto,
  PHOTO_MAX_BYTES, PHOTO_MAX_SIDE, NOT_A_PHOTO, PHOTO_TOO_LARGE,
} from "./photoPick";

const fileOf = (type, size, name = "pic.png") => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};
const blobOf = (size) => {
  const b = new Blob(["x"], { type: "image/jpeg" });
  Object.defineProperty(b, "size", { value: size });
  return b;
};
const okLoad = async () => ({ naturalWidth: 4000, naturalHeight: 3000 });

describe("photoPlan", () => {
  it("keeps JPEG, PNG and WebP under 5 MiB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(photoPlan({ type, size: PHOTO_MAX_BYTES - 1 })).toBe("keep");
    }
  });

  it("redraws a photo of exactly 5 MiB, which the server refuses", () => {
    expect(photoPlan({ type: "image/jpeg", size: PHOTO_MAX_BYTES })).toBe("redraw");
  });

  it("redraws a larger photo or another kind", () => {
    expect(photoPlan({ type: "image/jpeg", size: PHOTO_MAX_BYTES + 1 })).toBe("redraw");
    expect(photoPlan({ type: "image/gif", size: 1000 })).toBe("redraw");
    expect(photoPlan({ type: "image/heic", size: 1000 })).toBe("redraw");
    expect(photoPlan({ type: "", size: 1000 })).toBe("redraw");
  });
});

describe("redrawSize", () => {
  it("keeps the shape with the long side at most the limit", () => {
    expect(redrawSize(4800, 3600)).toEqual({ width: PHOTO_MAX_SIDE, height: 1800 });
    expect(redrawSize(3000, 6000)).toEqual({ width: 1200, height: PHOTO_MAX_SIDE });
  });

  it("never enlarges a small photo", () => {
    expect(redrawSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("preparePhoto", () => {
  it("returns a fitting photo unchanged, without redrawing", async () => {
    const file = fileOf("image/jpeg", 1000);
    const draw = jest.fn();
    await expect(preparePhoto(file, { load: okLoad, draw })).resolves.toBe(file);
    expect(draw).not.toHaveBeenCalled();
  });

  it("refuses a file the browser cannot read as a picture", async () => {
    const load = async () => { throw new Error(NOT_A_PHOTO); };
    await expect(preparePhoto(fileOf("image/jpeg", 1000), { load })).rejects.toThrow(NOT_A_PHOTO);
  });

  it("redraws a large photo as a JPEG with the same name", async () => {
    const draw = jest.fn(async () => blobOf(2000));
    const out = await preparePhoto(fileOf("image/png", PHOTO_MAX_BYTES * 2, "IMG_1.PNG"), { load: okLoad, draw });
    expect(out).toBeInstanceOf(File);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("IMG_1.jpg");
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("redraws a GIF even when it is small", async () => {
    const draw = jest.fn(async () => blobOf(500));
    const out = await preparePhoto(fileOf("image/gif", 800, "a.gif"), { load: okLoad, draw });
    expect(out.name).toBe("a.jpg");
  });

  it("tries a lower quality, then refuses a photo still too large", async () => {
    const draw = jest.fn(async () => blobOf(PHOTO_MAX_BYTES));
    await expect(preparePhoto(fileOf("image/jpeg", PHOTO_MAX_BYTES * 3), { load: okLoad, draw }))
      .rejects.toThrow(PHOTO_TOO_LARGE);
    expect(draw.mock.calls.map((c) => c[1])).toEqual([0.9, 0.8]);
  });

  it("refuses when the browser cannot make a JPEG", async () => {
    const draw = async () => null;
    await expect(preparePhoto(fileOf("image/gif", 800), { load: okLoad, draw })).rejects.toThrow(NOT_A_PHOTO);
  });

  it("returns null for no file", async () => {
    await expect(preparePhoto(null)).resolves.toBeNull();
  });
});
