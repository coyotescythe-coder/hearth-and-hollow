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

interface Props {
  onCreate: (input: {
    name: string;
    cls: CharacterClass;
    abilities: AbilityScores;
    notes: string;
  }) => void;
}

const DEFAULT_SCORES: AbilityScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

export function CharacterCreator({ onCreate }: Props) {
  const [name, setName] = useState("");
  const [cls, setCls] = useState<CharacterClass>("Fighter");
  const [abilities, setAbilities] = useState<AbilityScores>(DEFAULT_SCORES);
  const [notes, setNotes] = useState("");

  // Each value from the standard array should be used exactly once.
  const used = ABILITIES.map((a) => abilities[a]).sort((a, b) => b - a);
  const expected = [...STANDARD_ARRAY].sort((a, b) => b - a);
  const validSpread = used.every((v, i) => v === expected[i]);

  const hp = maxHpFor(cls, 1, abilityModifier(abilities.con));
  const ac = baseArmorClass(abilityModifier(abilities.dex));
  const ready = name.trim().length > 0 && validSpread;

  return (
    <div className="panel centered">
      <h2>Create your character</h2>

      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wrenn" />
      </label>

      <label>
        Class
        <select value={cls} onChange={(e) => setCls(e.target.value as CharacterClass)}>
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Ability scores — assign {STANDARD_ARRAY.join(", ")}</legend>
        {ABILITIES.map((ability: Ability) => (
          <label key={ability} className="ability-row">
            <span>{ABILITY_LABELS[ability]}</span>
            <select
              value={abilities[ability]}
              onChange={(e) =>
                setAbilities({ ...abilities, [ability]: Number(e.target.value) })
              }
            >
              {STANDARD_ARRAY.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <span className="muted">{formatModifier(abilityModifier(abilities[ability]))}</span>
          </label>
        ))}
        {!validSpread && <p className="warn">Use each value exactly once.</p>}
      </fieldset>

      <p className="muted">
        HP {hp} · AC {ac}
      </p>

      <label>
        Background (optional — the DM will use this)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="A disgraced locksmith looking for a way back into the guild."
        />
      </label>

      <button
        disabled={!ready}
        onClick={() => onCreate({ name: name.trim(), cls, abilities, notes: notes.trim() })}
      >
        Enter the world
      </button>
    </div>
  );
}
