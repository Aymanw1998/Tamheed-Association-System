import { guideSteps } from "./guideSteps";
import { guideFor } from "./guideNames";

test("guideFor: only ذكر gives Ibrahim", () => {
  expect(guideFor("ذكر")).toBe("ibrahim");
  expect(guideFor("انثى")).toBe("tamheed");
  expect(guideFor("")).toBe("tamheed");
  expect(guideFor(undefined)).toBe("tamheed");
});

test("four steps with the moods and the names filled in, for both guides", () => {
  const a = guideSteps("سارة", "tamheed");
  const b = guideSteps("علي", "ibrahim");
  expect(a.map((s) => s.mood)).toEqual(["explain", "point", "point", "celebrate"]);
  expect(a[0].text).toBe("أهلاً سارة! أنا تمهيد، سأرافقك في جولة قصيرة في موقع تمهيد ⁠-⁠ رياضة.");
  expect(b[0].text).toBe("أهلاً علي! أنا إبراهيم، سأرافقك في جولة قصيرة في موقع تمهيد ⁠-⁠ رياضة.");
  expect(b).toHaveLength(4);
  expect(b[3].text).toContain("بالتوفيق");
});
