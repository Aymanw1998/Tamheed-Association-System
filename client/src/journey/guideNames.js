// The guide's names and moods, apart from the drawings (characters.js), so the
// app can pick a guide without loading DiceBear.
export const GUIDE_NAMES = { tamheed: "تمهيد", ibrahim: "إبراهيم" };
export const MOODS = ["explain", "point", "warn", "celebrate"];

// "ذكر" -> Ibrahim; anything else (including unknown) -> Tamheed.
export const guideFor = (gender) => (gender === "ذكر" ? "ibrahim" : "tamheed");
