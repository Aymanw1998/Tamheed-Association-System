import { guideFor, GUIDE_NAMES, MOODS, avatarSvg } from "./characters";

test("a man gets Ibrahim, everyone else gets Tamheed", () => {
  expect(guideFor("ذكر")).toBe("ibrahim");
  expect(guideFor("انثى")).toBe("tamheed");
  expect(guideFor("")).toBe("tamheed");
  expect(guideFor(undefined)).toBe("tamheed");
});

test("the guides have their Arabic names", () => {
  expect(GUIDE_NAMES).toEqual({ tamheed: "تمهيد", ibrahim: "إبراهيم" });
});

test("every guide and mood draws an svg, and a repeat call returns the same string", () => {
  expect(MOODS).toEqual(["explain", "point", "warn", "celebrate"]);
  Object.keys(GUIDE_NAMES).forEach((guide) => {
    MOODS.forEach((mood) => {
      const svg = avatarSvg(guide, mood);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(avatarSvg(guide, mood)).toBe(svg);
    });
  });
});

test("different moods draw different faces", () => {
  expect(avatarSvg("tamheed", "explain")).not.toBe(avatarSvg("tamheed", "warn"));
});

test("the two guides look different in the same mood", () => {
  MOODS.forEach((mood) => expect(avatarSvg("tamheed", mood)).not.toBe(avatarSvg("ibrahim", mood)));
});
