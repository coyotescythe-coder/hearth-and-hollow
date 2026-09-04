import { useState } from "react";

interface Props {
  onSolo: (name: string) => void;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
}

export function JoinScreen({ onSolo, onCreate, onJoin }: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const ready = name.trim().length > 0;

  return (
    <div className="panel centered">
      <h1>AI Dungeon Master</h1>
      <p className="muted">Play solo, or gather a party around one shared story.</p>

      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dre" />
      </label>

      <div className="row">
        <button disabled={!ready} onClick={() => onSolo(name.trim())}>
          Start solo adventure
        </button>
        <button disabled={!ready} onClick={() => onCreate(name.trim())}>
          Create party session
        </button>
      </div>

      <hr />

      <label>
        Join with a code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          maxLength={6}
        />
      </label>
      <button disabled={!ready || code.trim().length !== 6} onClick={() => onJoin(name.trim(), code.trim())}>
        Join session
      </button>
    </div>
  );
}
