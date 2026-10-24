export default function TeamsPage({ teams }) {
  if (!teams.length) return <p className="muted pad">لا توجد فرق بعد</p>;
  return (
    <>
      {teams.map((t, i) => (
        <section className="box" key={i}>
          <h4>
            {t.sport.icon} {t.name}
          </h4>
          {t.coachNames.length > 0 && <p className="coaches">المدرب: {t.coachNames.join("، ")}</p>}
          <ul className="members">
            {t.members.map((m, j) => (
              <li key={j}>{[m.firstname, m.lastname].filter(Boolean).join(" ")}</li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
