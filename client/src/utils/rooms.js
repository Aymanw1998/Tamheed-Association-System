// Lessons store their room as a number string ("1".."9"). Rooms 6-9 are named
// places; the rest are shown as "غرفة N". "0" or empty means no room.
const ROOM_NAMES = {
  6: "المصلى",
  7: "مقر قديم",
  8: "الساحة",
  9: "التدريب الخارجي",
};

const ROOM_COUNT = 9;

export const roomLabel = (room) => {
  const n = Number(room ?? 0);
  if (!n) return "بدون غرفة";
  return ROOM_NAMES[n] || `غرفة ${n}`;
};

export const isNamedPlace = (room) => Boolean(ROOM_NAMES[Number(room ?? 0)]);

export const ROOM_OPTIONS = Array.from({ length: ROOM_COUNT }, (_, i) => ({
  value: String(i + 1),
  label: roomLabel(i + 1),
}));
