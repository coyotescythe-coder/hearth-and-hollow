import { useEffect, useRef, useState } from "react";
import {
  combatActionKinds,
  type CombatActionKind,
  type CombatState,
} from "@dnd/shared";
import { Icon, type IconName } from "./Icon.js";
interface Props {
  combat: CombatState | null;
  youCharacterId: string | null;
  busy: boolean;
  connected: boolean;
  pending: boolean;
  waitingForParty: boolean;
  onAct: (text: string) => void;
  onCombatAct: (
    kind: CombatActionKind,
    targetId: string | null,
    description: string,
  ) => void;
}
const actionIcons: Record<CombatActionKind, IconName> = {
  attack: "sword",
  cast: "wand",
  item: "pack",
  move: "move",
  pass: "shield",
};
export function ActionBar({
  combat,
  youCharacterId,
  busy,
  connected,
  pending,
  waitingForParty,
  onAct,
  onCombatAct,
}: Props) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<CombatActionKind>("attack");
  const [targetId, setTargetId] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const current = combat?.participants[combat.currentTurnIdx] ?? null;
  const inCombat = Boolean(combat?.active);
  const yourTurn = Boolean(
    inCombat && current && current.characterId === youCharacterId,
  );
  const blocked =
    busy || !connected || pending || (inCombat ? !yourTurn : waitingForParty);
  const targets =
    combat?.participants.filter(
      (p) => p.hpCurrent > 0 && p.characterId !== youCharacterId,
    ) ?? [];
  const selectedTarget = targets.some((p) => p.id === targetId) ? targetId : "";
  useEffect(() => {
    setText("");
    setTargetId("");
  }, [inCombat]);
  const submit = () => {
    if (blocked || (!inCombat && !text.trim())) return;
    if (inCombat) onCombatAct(kind, selectedTarget || null, text.trim());
    else onAct(text.trim());
    setText("");
  };
  const status = !connected
    ? "Reconnecting to your table…"
    : pending
      ? "Your action is on its way…"
      : busy
        ? "The Dungeon Master is weaving the story…"
        : inCombat && !yourTurn
          ? `${current?.name ?? "The Dungeon Master"} is taking a turn.`
          : waitingForParty
            ? "Your action is ready. Waiting for the rest of the party…"
            : yourTurn
              ? "Your turn. Make it count."
              : "The next words are yours.";
  return (
    <section
      className={`action-bar ${yourTurn && !busy ? "your-turn" : ""}`}
      aria-label="Your action"
    >
      <div className="action-status" role="status">
        <Icon name={yourTurn ? "sword" : busy || blocked ? "spark" : "book"} />
        <span>{status}</span>
        {yourTurn && !busy && <span className="turn-pill">YOUR TURN</span>}
      </div>
      {inCombat && (
        <fieldset disabled={blocked} className="combat-controls">
          <legend className="sr-only">Choose a combat action</legend>
          <div className="combat-kinds">
            {combatActionKinds.map((k) => (
              <button
                type="button"
                key={k}
                aria-pressed={kind === k}
                className={kind === k ? "selected" : ""}
                onClick={() => setKind(k)}
              >
                <Icon name={actionIcons[k]} />
                <span>{k === "pass" ? "Hold" : k}</span>
              </button>
            ))}
          </div>
          <label className="target-field">
            <span>Target</span>
            <select
              value={selectedTarget}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">No target</option>
              {targets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      )}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor="action-input">
          {inCombat ? "Describe your combat action" : "What do you do?"}
        </label>
        <textarea
          id="action-input"
          ref={input}
          rows={2}
          value={text}
          maxLength={inCombat ? 400 : 1000}
          onChange={(e) => setText(e.target.value)}
          disabled={blocked}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            inCombat
              ? yourTurn
                ? "How do you do it? Add a little detail…"
                : "Watch the scene unfold…"
              : "What do you do?"
          }
        />
        <button
          className="primary"
          disabled={blocked || (!inCombat && !text.trim())}
          type="submit"
        >
          {inCombat ? "Take turn" : "Act"}
          <Icon name="arrow" />
        </button>
      </form>
      <div className="composer-foot">
        <span>
          {inCombat
            ? "A choice, a roll, a consequence."
            : "Try anything. The world will answer."}
        </span>
        <span>
          Enter to act <span aria-hidden="true">·</span> Shift + Enter for a new
          line
        </span>
      </div>
    </section>
  );
}
