import { useId } from "react";

// The player card's artwork: a full shield with soft curves, green into
// soft blue, ribbons of arrows in orange, white and sky blue. Drawn in a
// 560×800 box and stretched over the 264×384 card. The same file lives in
// sport/src/CardArt.jsx; keep the two copies equal.

export const CARD_W = 264;
export const CARD_H = 384;
const VW = 560;
const VH = 800;
const INSET = 0.972; // the face inside the frame, around the centre

const OUTLINE =
  "M22 100 Q20 72 50 70 C130 70 170 56 205 42 C235 30 255 22 280 20 C305 22 325 30 355 42 C390 56 430 70 510 70 " +
  "Q540 72 538 100 C544 300 544 500 538 690 Q540 718 510 722 C430 722 390 736 355 752 C325 766 305 774 280 776 " +
  "C255 774 235 766 205 752 C170 736 130 722 50 722 Q20 718 22 690 C16 500 16 300 22 100 Z";
const INNER_TRANSFORM = `translate(${VW / 2} ${VH / 2}) scale(${INSET}) translate(${-VW / 2} ${-VH / 2})`;

// The face's outline in card pixels, for CSS clip-path on the HTML layers.
export const FACE_CLIP = OUTLINE.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => {
  const px = ((VW / 2 + (Number(x) - VW / 2) * INSET) * CARD_W) / VW;
  const py = ((VH / 2 + (Number(y) - VH / 2) * INSET) * CARD_H) / VH;
  return `${px.toFixed(1)} ${py.toFixed(1)}`;
});

const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
// The colour at t (0..1) along a list of colours.
const mix = (colors, t) => {
  const f = Math.min(colors.length - 1.0001, Math.max(0, t * (colors.length - 1)));
  const i = Math.floor(f);
  const a = hex(colors[i]);
  const b = hex(colors[i + 1]);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * (f - i))).join(",")})`;
};
// n points along a quadratic curve.
const curve = (x0, y0, x1, y1, cx, cy, n) =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1];
  });
// A ribbon of arrowheads along the points, larger in the middle, the colours
// blending from one end to the other.
const ribbon = (pts, size, colors) =>
  pts.slice(0, -1).map(([x, y], i) => {
    const [nx, ny] = pts[i + 1];
    const a = Math.atan2(ny - y, nx - x);
    const s = size * (0.55 + 0.45 * Math.sin((i / (pts.length - 1)) * Math.PI));
    const p = (dx, dy) =>
      `${(x + dx * Math.cos(a) - dy * Math.sin(a)).toFixed(1)},${(y + dx * Math.sin(a) + dy * Math.cos(a)).toFixed(1)}`;
    return { points: `${p(-s * 0.6, -s)} ${p(s * 0.7, 0)} ${p(-s * 0.6, s)} ${p(-s * 0.1, 0)}`, fill: mix(colors, i / (pts.length - 2)) };
  });

const RIBBONS = [
  { opacity: 0.5, arrows: ribbon(curve(-10, 500, 560, 110, 300, 450, 40), 24, ["#29a8e0", "#ffb000"]) },
  { opacity: 0.95, arrows: ribbon(curve(-10, 470, 560, 70, 300, 420, 40), 26, ["#4fc3f7", "#ffffff", "#ffb347", "#ff8a00", "#ff6a00"]) },
  { opacity: 0.85, arrows: ribbon(curve(300, 20, 560, 400, 470, 110, 26), 18, ["#ff8a00", "#ffd9a8", "#ffffff", "#8fdcff", "#4fc3f7"]) },
  { opacity: 0.95, arrows: ribbon(curve(420, 480, 500, 240, 520, 400, 16), 26, ["#ff8a00", "#ffb347", "#ffffff", "#8fdcff"]) },
];
const BOTTOM = ribbon(curve(50, 690, 510, 690, 280, 702, 30), 12, ["#8fdcff", "#ffffff", "#ffb347", "#ff8a00"]);
const DOTS = [];
for (let y = 70; y < 260; y += 18) {
  for (let x = 50; x < 300; x += 18) {
    DOTS.push({ d: `M${x} ${y} l4 6 l4 -6`, o: (0.18 * (1 - (y - 70) / 190) * (1 - (x - 50) / 250)).toFixed(3) });
  }
}

const Arrows = ({ list }) => list.map((a, i) => <polygon key={i} points={a.points} fill={a.fill} />);

// Gradient ids must be unique per page; React ids contain ":" which url() dislikes.
const useSvgId = () => useId().replace(/:/g, "");

// Frame and background, behind the photo.
export function CardBack({ className }) {
  const id = useSvgId();
  return (
    <svg className={className} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}base`} x1="0" y1="0" x2=".7" y2="1">
          <stop offset="0" stopColor="#34b26a" />
          <stop offset=".35" stopColor="#1f9a6e" />
          <stop offset=".7" stopColor="#22917f" />
          <stop offset="1" stopColor="#2b7f8f" />
        </linearGradient>
        <linearGradient id={`${id}rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".35" stopColor="#ff8a00" />
          <stop offset=".6" stopColor="#4fc3f7" />
          <stop offset=".8" stopColor="#8fdcff" />
          <stop offset="1" stopColor="#ff8a00" />
        </linearGradient>
        <radialGradient id={`${id}glow`} cx=".55" cy=".38" r=".42">
          <stop offset="0" stopColor="#8fdcff" stopOpacity=".55" />
          <stop offset="1" stopColor="#00a0c8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}warm`} cx=".9" cy=".15" r=".75">
          <stop offset="0" stopColor="#ff8a00" stopOpacity=".85" />
          <stop offset="1" stopColor="#f7941d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}soft`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#6cc4ee" stopOpacity=".18" />
          <stop offset="1" stopColor="#4fc3f7" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}thread`} x1="0" x2="1">
          <stop offset="0" stopColor="#ffd27a" stopOpacity="0" />
          <stop offset=".5" stopColor="#ffd27a" stopOpacity=".8" />
          <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d={OUTLINE} transform={INNER_TRANSFORM} />
        </clipPath>
      </defs>
      <path d={OUTLINE} fill={`url(#${id}rim)`} />
      <g clipPath={`url(#${id}c)`}>
        <rect width={VW} height={VH} fill={`url(#${id}base)`} />
        <rect width={VW} height={VH} fill={`url(#${id}warm)`} />
        <rect width={VW} height={VH} fill={`url(#${id}glow)`} />
        <path d="M-20 800 L-20 520 L560 160 L560 330 Z" fill={`url(#${id}soft)`} />
        <path d="M-20 560 L560 200 L560 214 L-20 574 Z" fill="#ffffff" opacity=".12" />
        {DOTS.map((dot, i) => (
          <path key={i} d={dot.d} fill="none" stroke="#7fd6ec" strokeOpacity={dot.o} strokeWidth="1.4" />
        ))}
        {RIBBONS.map((r, i) => (
          <g key={i} opacity={r.opacity}><Arrows list={r.arrows} /></g>
        ))}
        <path d="M0 360 Q260 250 560 300" fill="none" stroke="#8fdcff" strokeWidth="1.5" />
        <path d="M0 420 Q300 300 560 250" fill="none" stroke={`url(#${id}thread)`} strokeWidth="1" />
        <path d="M10 330 Q250 380 560 200" fill="none" stroke="#7fd6ec" strokeOpacity=".35" strokeWidth="1" />
      </g>
    </svg>
  );
}

// The lower panel, its rule and the bottom row of arrows: over the photo,
// under the name and stats.
export function CardPanel({ className }) {
  const id = useSvgId();
  return (
    <svg className={className} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}panel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1676d2" stopOpacity="0" />
          <stop offset=".3" stopColor="#1d6f78" stopOpacity=".7" />
          <stop offset="1" stopColor="#22607a" stopOpacity=".88" />
        </linearGradient>
        <linearGradient id={`${id}line`} x1="0" x2="1">
          <stop offset="0" stopColor="#00a0c8" stopOpacity="0" />
          <stop offset=".5" stopColor="#4fc3f7" />
          <stop offset="1" stopColor="#00a0c8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect y="400" width={VW} height="400" fill={`url(#${id}panel)`} />
      <g opacity=".85"><Arrows list={BOTTOM} /></g>
      <line x1="40" y1="548" x2="520" y2="548" stroke={`url(#${id}line)`} strokeWidth="2" />
    </svg>
  );
}

// The back, the horizontal 340×214 card: the same colours and arrows.
const ID_RIBBONS = [
  { opacity: 0.5, arrows: ribbon(curve(-10, 214, 350, 120, 160, 250, 26), 10, ["#4fc3f7", "#ffffff", "#ffb347", "#ff8a00"]) },
  { opacity: 0.35, arrows: ribbon(curve(-10, 190, 350, 96, 170, 220, 26), 8, ["#ff8a00", "#ffd9a8", "#8fdcff"]) },
];

export function IdArt({ className }) {
  const id = useSvgId();
  return (
    <svg className={className} viewBox="0 0 340 214" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}base`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34b26a" />
          <stop offset=".4" stopColor="#1f9a6e" />
          <stop offset=".75" stopColor="#22917f" />
          <stop offset="1" stopColor="#2b7f8f" />
        </linearGradient>
        <radialGradient id={`${id}warm`} cx="0" cy="1" r=".7">
          <stop offset="0" stopColor="#ff8a00" stopOpacity=".55" />
          <stop offset="1" stopColor="#f7941d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}glow`} cx=".17" cy=".6" r=".35">
          <stop offset="0" stopColor="#8fdcff" stopOpacity=".5" />
          <stop offset="1" stopColor="#00a0c8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="340" height="214" fill={`url(#${id}base)`} />
      <rect width="340" height="214" fill={`url(#${id}warm)`} />
      <rect width="340" height="214" fill={`url(#${id}glow)`} />
      <path d="M-10 214 L340 40 L340 70 L-10 230 Z" fill="#ffffff" opacity=".07" />
      {ID_RIBBONS.map((r, i) => (
        <g key={i} opacity={r.opacity}><Arrows list={r.arrows} /></g>
      ))}
      <path d="M0 150 Q170 90 340 120" fill="none" stroke="#8fdcff" strokeOpacity=".5" strokeWidth="1" />
    </svg>
  );
}
