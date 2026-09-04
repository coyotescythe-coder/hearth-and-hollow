import type { CombatState } from "@dnd/shared";

/** Only rendered while a fight is on. The server owns this order entirely. */
export function CombatPanel({ combat }: { combat: CombatState }) {
  return (
    <section className="sidebar-section">
      <h3>
        Combat <span className="muted">round {combat.round}</span>
      </h3>
      <ol className="initiative">
        {combat.participants.map((p, idx) => {
          const isCurrent = idx === combat.currentTurnIdx;
          const down = p.hpCurrent <= 0;
          return (
            <li key={p.id} className={`${isCurrent ? "current" : ""} ${down ? "down" : ""}`}>
              <span className="init">{p.initiative}</span>
              <strong>{p.name}</strong>
              <span className="muted">
                {down ? " down" : ` ${p.hpCurrent}/${p.hpMax}`} · AC {p.ac}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
