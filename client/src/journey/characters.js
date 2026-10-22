import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";

// License: the Avataaars style is by Pablo Stanley, free for personal and
// commercial use (https://avataaars.com/). @dicebear/core and
// @dicebear/collection are MIT.
export { GUIDE_NAMES, MOODS, guideFor } from "./guideNames";

const LOOKS = {
  tamheed: {
    top: ["hijab"],
    hatColor: ["164d63"],
    clothing: ["shirtCrewNeck"],
    clothesColor: ["257a97"],
    skinColor: ["edb98a"],
    accessoriesProbability: 0,
    facialHairProbability: 0,
  },
  ibrahim: {
    top: ["shortFlat"],
    hairColor: ["2c1b18"],
    facialHair: ["beardLight"],
    facialHairColor: ["2c1b18"],
    facialHairProbability: 100,
    clothing: ["shirtCrewNeck"],
    clothesColor: ["257a97"],
    skinColor: ["d08b5b"],
    accessoriesProbability: 0,
  },
};

const FACES = {
  explain: { eyes: ["default"], eyebrows: ["defaultNatural"], mouth: ["smile"] },
  point: { eyes: ["side"], eyebrows: ["raisedExcitedNatural"], mouth: ["smile"] },
  warn: { eyes: ["squint"], eyebrows: ["sadConcernedNatural"], mouth: ["serious"] },
  celebrate: { eyes: ["happy"], eyebrows: ["raisedExcited"], mouth: ["twinkle"] },
};

const cache = new Map();

// Built offline (no network); the same guide and mood return the same string.
export const avatarSvg = (guide, mood) => {
  const g = LOOKS[guide] ? guide : "tamheed";
  const m = FACES[mood] ? mood : "explain";
  const key = `${g}:${m}`;
  if (!cache.has(key)) {
    cache.set(key, createAvatar(avataaars, { ...LOOKS[g], ...FACES[m], backgroundColor: ["transparent"] }).toString());
  }
  return cache.get(key);
};
