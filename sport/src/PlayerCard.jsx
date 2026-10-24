import { PHOTO_URL } from "./api.js";
import { statCells, cardSubtitle } from "./format.js";
import logo from "./logo.png";

function Silhouette() {
  return (
    <svg viewBox="0 0 100 100" className="avatar" aria-hidden="true">
      <circle cx="50" cy="36" r="22" fill="#e6f7fd" opacity=".85" />
      <path d="M10 100c4-26 20-38 40-38s36 12 40 38z" fill="#e6f7fd" opacity=".85" />
    </svg>
  );
}

export default function PlayerCard({ card, student }) {
  const jersey = card.jerseyNumber ?? "—";
  const name = [student.firstname, student.lastname].filter(Boolean).join(" ");
  const subtitle = cardSubtitle(student.age, card.position);
  return (
    <div className="card-shadow">
      <div className="pcard">
        <div className="bg" />
        <div className="arc" />
        <div className="shine" />
        <div className="bignum">{card.jerseyNumber ?? ""}</div>
        <div className="frame" />
        <div className="sport">
          <span>{card.sport.icon}</span> {card.sport.name}
        </div>
        <div className="num">{jersey}</div>
        <div className="logo"><img src={logo} alt="" /></div>
        <div className="ph">
          {student.hasPhoto ? <img className="photo" src={PHOTO_URL} alt="" /> : <Silhouette />}
        </div>
        <div className="name">{name}</div>
        {subtitle && <div className="sub">{subtitle}</div>}
        <div className="stats">
          {statCells(card).map((c, i) => (
            <div key={i}>
              <b>{c.value}</b>
              {c.label}
            </div>
          ))}
        </div>
        <div className="foot">TAMHEED SPORT</div>
      </div>
    </div>
  );
}
