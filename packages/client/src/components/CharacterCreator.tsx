import { useState } from "react";
import {
  ABILITIES,
  ABILITY_LABELS,
  CLASSES,
  STANDARD_ARRAY,
  abilityModifier,
  baseArmorClass,
  formatModifier,
  maxHpFor,
  type Ability,
  type AbilityScores,
  type CharacterClass,
} from "@dnd/shared";
import { classIcons, Icon } from "./Icon.js";
interface Props {
  disabled: boolean;
  onCreate: (input: {
    name: string;
    cls: CharacterClass;
    abilities: AbilityScores;
    notes: string;
  }) => void;
}
const DEFAULT_SCORES: AbilityScores = {
  str: 15,
  dex: 14,
  con: 13,
  int: 12,
  wis: 10,
  cha: 8,
};
const descriptions: Record<CharacterClass, [string, string]> = {
  Fighter: [
    "Steel & resolve",
    "When the world draws its blade, you stand your ground.",
  ],
  Rogue: [
    "Shadow & cunning",
    "Every locked door is a question. You tend to have an answer.",
  ],
  Wizard: [
    "Ink & incantation",
    "You have read of impossible things. Now you mean to try them.",
  ],
  Cleric: [
    "Faith & fire",
    "Something greater walks beside you. Something worth believing in.",
  ],
  Ranger: ["Wild & watchful", "The road ends. Your way begins."],
};
export function CharacterCreator({ onCreate, disabled }: Props) {
  const [name, setName] = useState("");
  const [cls, setCls] = useState<CharacterClass>("Fighter");
  const [abilities, setAbilities] = useState<AbilityScores>(DEFAULT_SCORES);
  const [notes, setNotes] = useState("");
  // Assignment UX only: swap scores so each standard-array value stays in use.
  const assign = (ability: Ability, score: number) =>
    setAbilities((previous) => {
      const other = ABILITIES.find((a) => previous[a] === score)!;
      return { ...previous, [ability]: score, [other]: previous[ability] };
    });
  const hp = maxHpFor(cls, 1, abilityModifier(abilities.con));
  const ac = baseArmorClass(abilityModifier(abilities.dex));
  return (
    <main className="creation">
      <aside className="creation-aside">
        <span className="eyebrow">Before the first chapter</span>
        <h1>
          Who will <br />
          you become?
        </h1>
        <div className="class-sigil" key={cls}>
          <div className="sigil-orbit" />
          <Icon name={classIcons[cls]} />
        </div>
        <p className="eyebrow">{descriptions[cls][0]}</p>
        <h2>{cls}</h2>
        <p className="class-description">{descriptions[cls][1]}</p>
        <div className="derived-stats">
          <div>
            <Icon name="heart" />
            <strong>{hp}</strong>
            <span>Hit points</span>
          </div>
          <div>
            <Icon name="shield" />
            <strong>{ac}</strong>
            <span>Armor class</span>
          </div>
        </div>
        <p className="muted small">Level 1 · Every legend starts somewhere.</p>
      </aside>
      <form
        className="creation-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled && name.trim())
            onCreate({
              name: name.trim(),
              cls,
              abilities,
              notes: notes.trim(),
            });
        }}
      >
        <div className="section-heading">
          <span className="eyebrow">01 / Identity</span>
          <span className="muted small">Your character</span>
        </div>
        <label className="field">
          A name worth remembering
          <input
            autoFocus
            required
            maxLength={40}
            placeholder="e.g. Wrenn Ashford"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <fieldset className="class-choice">
          <legend>Choose your calling</legend>
          <div className="class-options">
            {CLASSES.map((c) => (
              <label key={c} className={cls === c ? "selected" : ""}>
                <input
                  type="radio"
                  name="class"
                  checked={cls === c}
                  onChange={() => setCls(c)}
                />
                <Icon name={classIcons[c]} />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="section-heading">
          <span className="eyebrow">02 / Your strengths</span>
          <span className="muted small">Changing a score swaps its place</span>
        </div>
        <fieldset className="score-grid">
          <legend className="sr-only">Assign ability scores</legend>
          {ABILITIES.map((a) => (
            <label key={a} className="score-field">
              <span>{ABILITY_LABELS[a]}</span>
              <select
                aria-label={`${ABILITY_LABELS[a]} score`}
                value={abilities[a]}
                onChange={(e) => assign(a, Number(e.target.value))}
              >
                {STANDARD_ARRAY.map((v) => (
                  <option value={v} key={v}>
                    {v}
                  </option>
                ))}
              </select>
              <span className="score-mod">
                {formatModifier(abilityModifier(abilities[a]))}
                <small> modifier</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="section-heading">
          <span className="eyebrow">03 / A life before this</span>
          <span className="muted small">Optional</span>
        </div>
        <label className="field">
          <span className="sr-only">Background</span>
          <textarea
            maxLength={600}
            rows={3}
            placeholder="What brought you here? A debt, a promise, a name you can’t forget…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="creation-submit">
          <p className="muted small">
            Your background gives the Dungeon Master
            <br />a thread to weave into the story.
          </p>
          <button className="primary" disabled={!name.trim() || disabled}>
            Enter the world
            <Icon name="arrow" />
          </button>
        </div>
      </form>
    </main>
  );
}
