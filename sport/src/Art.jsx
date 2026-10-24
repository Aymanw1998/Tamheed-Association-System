import { useId } from "react";
import logo from "./logo.png";

// Gradient ids must be unique per SVG on the page; React ids contain ":" which url() dislikes.
const useSvgId = () => useId().replace(/:/g, "");

const rad = (deg) => (deg * Math.PI) / 180;
const polar = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
const pentagon = (cx, cy, r, rot) => Array.from({ length: 5 }, (_, i) => polar(cx, cy, r, rot + 72 * i));
const pts = (list) => list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
const dist = ([a, b], [c, d]) => Math.hypot(a - c, b - d);

// Classic ball pattern seen from the front: a centre pentagon, five outer pentagons, and the seams between them.
const CENTER = pentagon(50, 50, 15, -90);
const OUTER = CENTER.map((_, k) => {
  const th = -90 + 72 * k;
  const [cx, cy] = polar(50, 50, 43, th);
  return pentagon(cx, cy, 13.5, th + 180); // vertex 0 points at the centre
});
const SEAMS = [];
OUTER.forEach((p, k) => {
  SEAMS.push([CENTER[k], p[0]]);
  const next = OUTER[(k + 1) % 5];
  let best = null;
  for (const i of [1, 4]) {
    for (const j of [1, 4]) {
      const d = dist(p[i], next[j]);
      if (!best || d < best.d) best = { d, a: p[i], b: next[j] };
    }
  }
  SEAMS.push([best.a, best.b]);
  // The two outer corners run off the edge of the ball.
  for (const i of [2, 3]) {
    const [x, y] = p[i];
    const len = Math.hypot(x - 50, y - 50);
    SEAMS.push([p[i], [50 + ((x - 50) / len) * 60, 50 + ((y - 50) / len) * 60]]);
  }
});

export function Ball({ className }) {
  const id = useSvgId();
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}b`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".55" stopColor="#eef2f4" />
          <stop offset="1" stopColor="#aab6bd" />
        </radialGradient>
        <radialGradient id={`${id}s`} cx="50%" cy="50%" r="50%">
          <stop offset=".62" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".35" />
        </radialGradient>
        <radialGradient id={`${id}h`} cx="34%" cy="26%" r="30%">
          <stop offset="0" stopColor="#fff" stopOpacity=".9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}c`}>
          <circle cx="50" cy="50" r="47" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="47" fill={`url(#${id}b)`} />
      <g clipPath={`url(#${id}c)`}>
        <g stroke="#26323a" strokeWidth="1.6" strokeLinecap="round" fill="none">
          {SEAMS.map(([a, b], i) => (
            <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
          ))}
        </g>
        <polygon points={pts(CENTER)} fill="#1c262d" stroke="#1c262d" strokeWidth="1.5" strokeLinejoin="round" />
        {OUTER.map((p, i) => (
          <polygon key={i} points={pts(p)} fill="#1c262d" stroke="#1c262d" strokeWidth="1.5" strokeLinejoin="round" />
        ))}
      </g>
      <circle cx="50" cy="50" r="47" fill={`url(#${id}s)`} />
      <circle cx="50" cy="50" r="47" fill={`url(#${id}h)`} />
      <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1" />
    </svg>
  );
}

// A player outline in a jersey, used when the student has no photo.
export function Silhouette({ className }) {
  const id = useSvgId();
  return (
    <svg className={className} viewBox="0 0 120 130" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".92" />
          <stop offset="1" stopColor="#d5e4e8" stopOpacity=".78" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="40" rx="20" ry="23" fill={`url(#${id}f)`} />
      <path
        d="M8 130 C10 100 24 84 47 78 C51 76 52 72 52 62 L68 62 C68 72 69 76 73 78 C96 84 110 100 112 130 Z"
        fill={`url(#${id}f)`}
      />
      <path d="M47 78 L60 91 L73 78" fill="none" stroke="#f7941d" strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  );
}

// The association logo in a white circle with the orange ring.
export function LogoBadge({ className = "" }) {
  return (
    <span className={`logo-badge ${className}`}>
      <img src={logo} alt="" />
    </span>
  );
}

// A bank of stadium lights on a short mast.
export function Floodlight({ className }) {
  const lamps = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 4; c += 1) lamps.push([9 + c * 10, 7 + r * 8]);
  }
  return (
    <svg className={className} viewBox="0 0 58 64" aria-hidden="true">
      <path d="M27 30 L31 30 L33 64 L25 64 Z" fill="#06141d" opacity=".9" />
      <rect x="3" y="1" width="52" height="29" rx="3" fill="#0a1b26" stroke="#24404f" strokeWidth="1" />
      {lamps.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4.6" fill="#fffbe6" opacity=".35" />
          <circle cx={x} cy={y} r="3" fill="#ffffff" />
        </g>
      ))}
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function FlipIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7M20 4v4.7h-4.7M20 12a8 8 0 0 1-13.7 5.6L4 15.3M4 20v-4.7h4.7" />
    </svg>
  );
}
