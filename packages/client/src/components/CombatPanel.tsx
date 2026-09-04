import type { CombatState } from "@dnd/shared";
import { Icon } from "./Icon.js";
export function CombatPanel({
  combat,
  youCharacterId,
}: {
  combat: CombatState;
  youCharacterId: string | null;
}) {
  return (
    <section className="combat-panel" aria-label="Initiative order">
      <div className="section-heading">
        <span className="eyebrow">
          <Icon name="sword" /> Initiative
        </span>
        <span className="round">Round {combat.round}</span>
      </div>
      <ol className="initiative">
        {combat.participants.map((p, idx) => {
          const current = idx === combat.currentTurnIdx;
          return (
            <li
              key={p.id}
              className={`${current ? "current" : ""} ${p.hpCurrent <= 0 ? "down" : ""}`}
              aria-current={current ? "step" : undefined}
            >
              <span className="init">{p.initiative}</span>
              <div>
                <strong>
                  {p.name}
                  {p.characterId === youCharacterId && <small> you</small>}
                </strong>
                <span>
                  {p.hpCurrent <= 0 ? "Down" : `${p.hpCurrent}/${p.hpMax} HP`} ·
                  AC {p.ac}
                </span>
              </div>
              {current && <Icon name="arrow" />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
