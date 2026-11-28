// One nasheed's lines (owner, 2026-11-27): a verse is one row, صدر on the
// right and عجز on the left, on a phone too; a centered line is centered; a
// break is ***. The read page and the PDF use this same component.
import NasheedLines from "./NasheedLines.jsx";
import { mount, unmountAll } from "../testUtils";

afterEach(unmountAll);

const LINES = [
  { kind: "center", text: "اللهُ اللهْ" },
  { kind: "verse", sadr: "أَوْقَدْتَ فِي قَلْبِي هَوَاكْ", ajuz: "وَقُلْتَ لِي إِيَّاكَ تَبُوحْ" },
  { kind: "break" },
  { kind: "verse", sadr: "لَمَّا بَدَا مِنْكَ القَبُولْ", ajuz: "أَخْرَجْتَ مِنْ سِجْنِ الأَسَى" },
];

test("a verse is one row with the صدر first (right) and the عجز second (left); tashkeel as stored", async () => {
  const c = await mount(<NasheedLines lines={LINES} />);
  const rows = [...c.querySelectorAll(".nl-row")];
  expect(rows.map((r) => r.dataset.kind)).toEqual(["center", "verse", "break", "verse"]);
  const halves = [...rows[1].children];
  expect(halves.map((h) => h.className)).toEqual(["nl-sadr", "nl-ajuz"]);
  expect(halves[0].textContent).toBe("أَوْقَدْتَ فِي قَلْبِي هَوَاكْ");
  expect(halves[1].textContent).toBe("وَقُلْتَ لِي إِيَّاكَ تَبُوحْ");
  expect(rows[0].textContent).toBe("اللهُ اللهْ");
  expect(rows[2].textContent).toBe("***");
});

test("a verse keeps two equal columns at every width, so a long half wraps inside its own column", async () => {
  const c = await mount(<NasheedLines lines={LINES} />);
  const verse = c.querySelector('.nl-row[data-kind="verse"]');
  expect(verse.style.display).toBe("grid");
  expect(verse.style.gridTemplateColumns).toBe("minmax(0, 1fr) minmax(0, 1fr)");
  // No media query switches it to one column: the style is inline, not a class rule.
  expect(c.querySelector(".nasheed-lines").getAttribute("dir")).toBe("rtl");
});

test("the size is set on the container", async () => {
  const c = await mount(<NasheedLines lines={LINES} size={22} />);
  expect(c.querySelector(".nasheed-lines").style.fontSize).toBe("22px");
});
