import {
  ABILITIES,
  ABILITY_LABELS,
  abilityModifier,
  formatModifier,
  type Character,
} from "@dnd/shared";

export function CharacterSheet({ character }: { character: Character }) {
  const hpPct = Math.max(0, Math.round((character.hpCurrent / character.hpMax) * 100));

  return (
    <section className="sidebar-section">
      <h3>
        {character.name} <span className="muted">lvl {character.level} {character.cls}</span>
      </h3>

      <div className="hp-bar" aria-label={`Hit points ${character.hpCurrent} of ${character.hpMax}`}>
        <div className="hp-fill" style={{ width: `${hpPct}%` }} />
      </div>
      <p className="muted">
        HP {character.hpCurrent}/{character.hpMax} · AC {character.ac}
      </p>

      <ul className="abilities">
        {ABILITIES.map((a) => (
          <li key={a}>
            <span>{ABILITY_LABELS[a].slice(0, 3).toUpperCase()}</span>
            <strong>{character.abilities[a]}</strong>
            <span className="muted">{formatModifier(abilityModifier(character.abilities[a]))}</span>
          </li>
        ))}
      </ul>

      {character.conditions.length > 0 && (
        <p className="warn">Conditions: {character.conditions.join(", ")}</p>
      )}
    </section>
  );
}
