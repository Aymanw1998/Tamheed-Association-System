import logo from "../logo.png";
import { Link } from "../router.jsx";

// The header «موج الصوت» (owner, 2026-11-28), drawn like the sport site's
// «الملعب الليلي»: the association logo in a white circle on the logo's own
// blue-to-orange, rings going out from it like sound, and Arabic letters
// rising faintly behind. The drawing is aria-hidden; a phone that asks for
// less motion sees it still (styles.css). The site's name is Tamheed-Anasheed
// (owner, 2026-11-28). On a computer the logo, name and buttons line up with
// the page's column (.wave-inner).
const LETTERS = ["ن", "ش", "ي", "د", "ا", "ل", "ه", "م", "ح", "ب"];
export const SITE_NAME = "Tamheed-Anasheed";

export default function WaveHero({ compact = false, children }) {
  return (
    <header className={`wave-hero${compact ? " compact" : ""}`}>
      <span className="wave-letters" aria-hidden="true">
        {LETTERS.map((c, i) => <span key={i} style={{ left: `${8 + i * 9}%`, animationDelay: `-${(i * 0.9).toFixed(1)}s` }}>{c}</span>)}
      </span>
      <div className="wave-inner">
        <span className="wave-ring" aria-hidden="true" />
        <span className="wave-ring" aria-hidden="true" />
        <span className="wave-ring" aria-hidden="true" />
        <span className="wave-badge"><img src={logo} alt="شعار جمعية تمهيد" /></span>
        <div className="wave-hello">
          <Link to="/" className="wave-title" dir="ltr">{SITE_NAME}</Link>
          <p>فريق الأناشيد</p>
        </div>
        {children && <div className="wave-actions">{children}</div>}
      </div>
    </header>
  );
}
