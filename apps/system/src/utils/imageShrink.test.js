import { needsShrink, shrinkImage, SHRINK_TARGET } from "./imageShrink";

const file = (name, type, size) => ({ name, type, size, lastModified: 1 });
const blob = (size) => new Blob([new Uint8Array(size)], { type: "image/jpeg" });

test("only JPEG, PNG and WebP over about 1 MB are shrunk", () => {
  expect(needsShrink(file("a.jpg", "image/jpeg", SHRINK_TARGET + 1))).toBe(true);
  expect(needsShrink(file("a.png", "image/png", 5e6))).toBe(true);
  expect(needsShrink(file("a.jpg", "image/jpeg", SHRINK_TARGET))).toBe(false);
  expect(needsShrink(file("a.gif", "image/gif", 5e6))).toBe(false);
  expect(needsShrink(file("a.pdf", "application/pdf", 5e6))).toBe(false);
});

test("a large photo becomes a JPEG of about 1 MB, trying smaller steps until it fits", async () => {
  const sizes = [3e6, 1.5e6, 900000];
  const tried = [];
  const out = await shrinkImage(file("trip.PNG", "image/png", 6e6), {
    load: async () => ({}),
    draw: async (_img, side, quality) => { tried.push([side, quality]); return blob(sizes.shift()); },
  });
  expect(tried).toEqual([[2400, 0.85], [2000, 0.8], [1600, 0.75]]);
  expect(out.name).toBe("trip.jpg");
  expect(out.type).toBe("image/jpeg");
  expect(out.size).toBe(900000);
});

test("an unreadable picture, or one that would not get smaller, goes as it is", async () => {
  const big = file("a.jpg", "image/jpeg", 2e6);
  expect(await shrinkImage(big, { load: async () => { throw new Error("x"); } })).toBe(big);
  expect(await shrinkImage(big, { load: async () => ({}), draw: async () => blob(3e6) })).toBe(big);
});
