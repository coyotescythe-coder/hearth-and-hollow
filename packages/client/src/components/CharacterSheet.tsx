import {
  ABILITIES,
  ABILITY_LABELS,
  abilityModifier,
  formatModifier,
  type Character,
} from "@dnd/shared";
import { classIcons, Icon } from "./Icon.js";
import { useHitEffect } from "../hooks/useHitEffect.js";
export function CharacterSheet({ character }: { character: Character }) {
  const hit = useHitEffect(character.hpCurrent);
  const hpPct = Math.min(
    100,
    Math.max(0, (character.hpCurrent / character.hpMax) * 100),
  );
  return (
    <section
      className={`character-sheet ${hit ? "is-hit" : ""}`}
      aria-label="Your character"
    >
      <div className="section-heading">
        <span className="eyebrow">Your character</span>
        <span className="level-mark">
          {String(character.level).padStart(2, "0")}
        </span>
      </div>
      <div className="character-identity">
        <div className="portrait-seal">
          <Icon name={classIcons[character.cls]} />
        </div>
        <h2>{character.name}</h2>
        <p className="eyebrow">
          Level {character.level} · {character.cls}
        </p>
      </div>
      <div className="vitality">
        <div>
          <span>
            <Icon name="heart" /> Vitality
          </span>
          <strong>
            {character.hpCurrent}
            <small> / {character.hpMax}</small>
          </strong>
        </div>
        <div
          className="hp-bar"
          role="meter"
          aria-label="Hit points"
          aria-valuemin={0}
          aria-valuemax={character.hpMax}
          aria-valuenow={character.hpCurrent}
        >
          <div className="hp-fill" style={{ width: `${hpPct}%` }} />
        </div>
        {hit && (
          <span key={hit.key} className="damage-number" role="status">
            −{hit.amount} HP
          </span>
        )}
      </div>
      <div className="armor-stat">
        <Icon name="shield" />
        <span>Armor class</span>
        <strong>{character.ac}</strong>
      </div>
      <div className="section-heading">
        <span className="eyebrow">Abilities</span>
        <span className="muted small">Score / modifier</span>
      </div>
      <dl className="abilities">
        {ABILITIES.map((a) => (
          <div key={a}>
            <dt title={ABILITY_LABELS[a]}>
              {a.toUpperCase()}
              <span className="sr-only"> — {ABILITY_LABELS[a]}</span>
            </dt>
            <dd>
              {character.abilities[a]}
              <strong>
                {formatModifier(abilityModifier(character.abilities[a]))}
              </strong>
            </dd>
          </div>
        ))}
      </dl>
      {character.conditions.length > 0 && (
        <div className="conditions" role="status">
          {character.conditions.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      )}
      {character.notes && (
        <details className="background-notes">
          <summary>Before the adventure</summary>
          <p>{character.notes}</p>
        </details>
      )}
      <div className="sheet-end">
        <span />
        <Icon name="spark" />
        <span />
      </div>
    </section>
  );
}
