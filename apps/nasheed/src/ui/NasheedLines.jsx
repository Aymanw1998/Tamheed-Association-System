// One nasheed's lines (owner, 2026-11-27), the same on the phone and in the
// PDF: a verse is one row, the صدر in the right half and the عجز in the left,
// two equal columns at every width (a long half wraps inside its own half);
// a centered line is centered; a break is ***. Styles are inline so the PDF's
// off-screen copy looks the same without the site's stylesheet.
const VERSE = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", columnGap: "1.5em", alignItems: "start" };
const CENTER = { textAlign: "center" };
const BREAK = { textAlign: "center", letterSpacing: "0.3em", margin: "0.4em 0" };
const SADR = { textAlign: "right", overflowWrap: "anywhere" };
const AJUZ = { textAlign: "right", overflowWrap: "anywhere" };

export default function NasheedLines({ lines = [], size = 20 }) {
  return (
    <div className="nasheed-lines" dir="rtl" style={{ fontSize: `${size}px`, lineHeight: 1.9 }}>
      {lines.map((line, i) => {
        if (line.kind === "verse") {
          return (
            <div key={i} className="nl-row" data-kind="verse" style={VERSE}>
              <span className="nl-sadr" style={SADR}>{line.sadr}</span>
              <span className="nl-ajuz" style={AJUZ}>{line.ajuz}</span>
            </div>
          );
        }
        if (line.kind === "center") return <div key={i} className="nl-row" data-kind="center" style={CENTER}>{line.text}</div>;
        return <div key={i} className="nl-row" data-kind="break" style={BREAK} aria-hidden="true">***</div>;
      })}
    </div>
  );
}
