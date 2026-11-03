import { useCallback, useEffect, useRef, useState } from "react";

// A photo picked for a student or a user, checked before it is shown or sent.
// The server takes JPEG, PNG or WebP under 5 MiB (the invite route refuses
// anything else with BAD_PHOTO, and a file of exactly 5 MiB as too large),
// so a gallery photo that is larger or of another kind (GIF, HEIC where the
// browser can read it) is redrawn as a smaller JPEG here. A file the browser cannot read as a picture is refused.
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // a photo must be smaller than this
export const PHOTO_MAX_SIDE = 2400; // the long side of a redrawn photo

export const NOT_A_PHOTO = "تعذّرت قراءة هذا الملف كصورة. اختر صورة JPG أو PNG.";
export const PHOTO_TOO_LARGE = "الصورة كبيرة جدًا. اختر صورة أصغر.";

// Whether a picked file can go as it is ("keep") or must be redrawn ("redraw").
export const photoPlan = ({ type, size }) =>
  PHOTO_TYPES.includes(type) && size < PHOTO_MAX_BYTES ? "keep" : "redraw";

// The size a redrawn photo gets: the same shape, the long side at most
// PHOTO_MAX_SIDE.
export const redrawSize = (width, height) => {
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(NOT_A_PHOTO)); };
    img.src = url;
  });

const drawJpeg = (img, quality) => {
  const { width, height } = redrawSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // a transparent PNG or GIF goes on white, not black
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
};

const jpegName = (name) => `${String(name || "photo").replace(/\.[^.]*$/, "") || "photo"}.jpg`;

// The file to keep in the form: the picked file itself, or a redrawn JPEG.
// Throws an Error whose message can be shown to the user.
export const preparePhoto = async (file, { load = loadImage, draw = drawJpeg } = {}) => {
  if (!file) return null;
  const img = await load(file);
  if (photoPlan(file) === "keep") return file;
  for (const quality of [0.9, 0.8]) {
    const blob = await draw(img, quality);
    if (!blob) throw new Error(NOT_A_PHOTO);
    if (blob.size < PHOTO_MAX_BYTES) return new File([blob], jpegName(file.name), { type: "image/jpeg" });
  }
  throw new Error(PHOTO_TOO_LARGE);
};

export const PHOTO_NOT_READY = "الصورة قيد التجهيز. انتظر لحظة ثم احفظ.";

// A form's photo picker. pick(file) checks the file and puts the result in
// the form with setPhoto; a refused file is reported with onError and the
// form keeps its photo. Only the latest pick counts: a pick that finishes
// after a newer pick, after cancel() (the user removed the photo), after
// `scope` changed (the form now shows another record) or after the form
// closed changes nothing. `busy` is true while a pick is checked,
// so the form can hold its save until the photo is ready.
export const usePhotoPick = (setPhoto, onError, { scope, prepare = preparePhoto } = {}) => {
  const latest = useRef(0);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    latest.current++;
    setBusy(false);
  }, [scope]);

  const pick = useCallback(async (file) => {
    if (!file) return;
    const mine = ++latest.current;
    const current = () => alive.current && mine === latest.current;
    setBusy(true);
    try {
      const out = await prepare(file);
      if (current()) setPhoto(out);
    } catch (err) {
      if (current()) onError(err.message);
    } finally {
      if (current()) setBusy(false);
    }
  }, [setPhoto, onError, prepare]);

  const cancel = useCallback(() => {
    latest.current++;
    setBusy(false);
  }, []);

  return { pick, cancel, busy };
};
