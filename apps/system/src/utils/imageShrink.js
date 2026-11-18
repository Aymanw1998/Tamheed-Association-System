// Pictures uploaded to «الملفات» (owner, 2026-11-16): a JPEG, PNG or WebP
// over about 1 MB is redrawn as a smaller JPEG, unless the user ticked
// «الجودة الأصلية». Other files, GIFs (they may move) and a picture the
// browser cannot read go as they are.
export const SHRINK_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const SHRINK_TARGET = 1024 * 1024;
// Tried in order until the result is small enough: [long side, quality].
const STEPS = [[2400, 0.85], [2000, 0.8], [1600, 0.75], [1280, 0.7]];

export const needsShrink = (file) => Boolean(file) && SHRINK_TYPES.includes(file.type) && file.size > SHRINK_TARGET;

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });

const drawJpeg = (img, side, quality) => {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, side / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // a transparent PNG goes on white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
};

const jpegName = (name) => `${String(name || "image").replace(/\.[^.]*$/, "") || "image"}.jpg`;

// The file to upload: the smaller JPEG, or the picked file itself when it
// needs no shrinking, cannot be read, or would not get smaller.
export async function shrinkImage(file, { load = loadImage, draw = drawJpeg } = {}) {
  if (!needsShrink(file)) return file;
  let img;
  try { img = await load(file); } catch { return file; }
  let best = null;
  for (const [side, quality] of STEPS) {
    const blob = await draw(img, side, quality);
    if (!blob) return file;
    if (!best || blob.size < best.size) best = blob;
    if (blob.size <= SHRINK_TARGET) break;
  }
  if (!best || best.size >= file.size) return file;
  return new File([best], jpegName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
}
