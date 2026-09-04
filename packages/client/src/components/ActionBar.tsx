import { useState } from "react";
import { combatActionKinds, type CombatActionKind, type CombatState } from "@dnd/shared";

interface Props {
  combat: CombatState | null;
  youCharacterId: string | null;
  busy: boolean;
  onAct: (text: string) => void;
  onCombatAct: (kind: CombatActionKind, targetId: string | null, description: string) => void;
}

/** Free-form input out of combat; a compact action menu on your turn in a fight. */
export function ActionBar({ combat, youCharacterId, busy, onAct, onCombatAct }: Props) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<CombatActionKind>("attack");
  const [targetId, setTargetId] = useState<string | null>(null);

  const current = combat?.participants[combat.currentTurnIdx] ?? null;
  const isYourTurn = Boolean(combat?.active && current && current.characterId === youCharacterId);

  if (combat?.active) {
    if (!isYourTurn) {
      return (
        <div className="action-bar muted">
          Waiting for <strong>{current?.name ?? "the DM"}</strong>…
        </div>
      );
    }

    const targets = combat.participants.filter((p) => p.hpCurrent > 0 && p.characterId !== youCharacterId);

    return (
      <div className="action-bar">
        <select value={kind} onChange={(e) => setKind(e.target.value as CombatActionKind)}>
          {combatActionKinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        <select value={targetId ?? ""} onChange={(e) => setTargetId(e.target.value || null)}>
          <option value="">(no target)</option>
          {targets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="How do you do it? (optional)"
        />

        <button
          disabled={busy}
          onClick={() => {
            onCombatAct(kind, targetId, text.trim());
            setText("");
          }}
        >
          Take turn
        </button>
      </div>
    );
  }

  const submit = () => {
    const value = text.trim();
    if (!value || busy) return;
    onAct(value);
    setText("");
  };

  return (
    <div className="action-bar">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={busy ? "The DM is narrating…" : "What do you do?"}
        disabled={busy}
      />
      <button onClick={submit} disabled={busy || text.trim().length === 0}>
        Act
      </button>
    </div>
  );
}
