import type { Character, Player } from "@dnd/shared";

interface Props {
  players: Player[];
  characters: Character[];
  youPlayerId: string;
  awaitingPlayerIds: string[];
}

/** Hidden entirely in solo sessions — there is no party to show. */
export function PartyPanel({ players, characters, youPlayerId, awaitingPlayerIds }: Props) {
  const others = players.filter((p) => p.id !== youPlayerId);
  if (others.length === 0) return null;

  return (
    <section className="sidebar-section">
      <h3>Party</h3>
      <ul className="party">
        {others.map((player) => {
          const character = characters.find((c) => c.id === player.characterId);
          return (
            <li key={player.id} className={player.connected ? "" : "muted"}>
              <strong>{character?.name ?? player.name}</strong>
              {character && (
                <span className="muted">
                  {" "}
                  {character.cls} · HP {character.hpCurrent}/{character.hpMax}
                </span>
              )}
              {!player.connected && <span className="muted"> (offline)</span>}
              {awaitingPlayerIds.includes(player.id) && <span className="waiting"> · deciding…</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
