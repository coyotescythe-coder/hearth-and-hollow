import type { Character, Player } from "@dnd/shared";
import { classIcons, Icon } from "./Icon.js";
interface Props {
  players: Player[];
  characters: Character[];
  youPlayerId: string;
  awaitingPlayerIds: string[];
}
export function PartyPanel({
  players,
  characters,
  youPlayerId,
  awaitingPlayerIds,
}: Props) {
  const others = players.filter((p) => p.id !== youPlayerId);
  return (
    <section className="party-panel">
      <div className="section-heading">
        <span className="eyebrow">Around the table</span>
        <Icon name="people" />
      </div>
      {others.length === 0 ? (
        <p className="muted small">
          There’s room by the fire. Share your invite code to bring friends
          along.
        </p>
      ) : (
        <ul className="party">
          {others.map((player) => {
            const character = characters.find(
              (c) => c.id === player.characterId,
            );
            return (
              <li key={player.id}>
                <span
                  className={`party-avatar ${player.connected ? "online" : ""}`}
                >
                  <Icon
                    name={character ? classIcons[character.cls] : "people"}
                  />
                </span>
                <div>
                  <strong>{character?.name ?? player.name}</strong>
                  <span>
                    {!player.connected
                      ? "Away from the table"
                      : !character
                        ? "Creating a character"
                        : awaitingPlayerIds.includes(player.id)
                          ? "Considering their next move…"
                          : "Ready"}
                  </span>
                  {character && (
                    <small>
                      {character.cls} · {character.hpCurrent}/{character.hpMax}{" "}
                      HP
                    </small>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
