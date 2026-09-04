import { useState } from "react";
import { Brand, Icon } from "./Icon.js";
interface Props {
  connected: boolean;
  pending: boolean;
  onSolo: (name: string) => void;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
}
export function JoinScreen({
  connected,
  pending,
  onSolo,
  onCreate,
  onJoin,
}: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"solo" | "party" | "join">("solo");
  const ready =
    name.trim().length > 0 &&
    (mode !== "join" || code.trim().length === 6) &&
    connected &&
    !pending;
  return (
    <main className="landing">
      <section className="landing-world">
        <Brand />
        <div className="landing-title">
          <span className="eyebrow">A tabletop adventure, alive in words</span>
          <h1>
            Every great story
            <br />
            begins with
            <br />
            <em>a little danger.</em>
          </h1>
        </div>
        <img
          className="landing-art"
          src="/hollow.svg"
          alt="An ancient stone doorway in a moonlit forest, a winding path disappearing through it."
        />
        <div className="landing-colophon">
          <span>Bring your imagination.</span>
          <span>We’ll keep the fire.</span>
        </div>
      </section>
      <section className="landing-paper">
        <div className="folio-corner">
          THE FIRST PAGE <span>01</span>
        </div>
        <div className="join-form">
          <span className="small-emblem">
            <Icon name="spark" />
          </span>
          <p className="eyebrow">A seat at the table</p>
          <h2>
            The unknown <br />
            is calling.
          </h2>
          <p className="intro">
            A world shaped by your choices.
            <br />
            An AI Dungeon Master to bring it to life.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) {
                if (mode === "solo") onSolo(name.trim());
                else if (mode === "party") onCreate(name.trim());
                else onJoin(name.trim(), code.trim());
              }
            }}
          >
            <label className="field">
              What should we call you?
              <input
                autoComplete="nickname"
                required
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name, adventurer"
              />
            </label>
            <fieldset className="journey-choice">
              <legend>Choose your company</legend>
              <div className="journey-options">
                {(["solo", "party", "join"] as const).map((value) => (
                  <label
                    className={`journey-option ${mode === value ? "selected" : ""}`}
                    key={value}
                  >
                    <input
                      type="radio"
                      name="journey"
                      checked={mode === value}
                      onChange={() => setMode(value)}
                    />
                    <Icon
                      name={
                        value === "solo"
                          ? "compass"
                          : value === "party"
                            ? "people"
                            : "book"
                      }
                    />
                    <strong>
                      {value === "solo"
                        ? "Go solo"
                        : value === "party"
                          ? "Gather a party"
                          : "Join friends"}
                    </strong>
                    <span>
                      {value === "solo"
                        ? "Your own tale"
                        : value === "party"
                          ? "Start together"
                          : "With an invite"}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {mode === "join" && (
              <label className="field code-field">
                Six-character invite code
                <input
                  required
                  minLength={6}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                />
              </label>
            )}
            <button className="primary embark" disabled={!ready}>
              {pending
                ? "Opening your story…"
                : mode === "join"
                  ? "Find your table"
                  : "Begin your adventure"}
              <Icon name="arrow" />
            </button>
          </form>
          <p className="form-footnote">
            <Icon name="die" /> Real dice. Shared stories. Unwritten endings.
          </p>
        </div>
        <footer className="paper-footer">
          <span>A little courage goes a long way.</span>
          <Icon name="spark" />
        </footer>
      </section>
    </main>
  );
}
