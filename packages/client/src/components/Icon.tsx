import type { CharacterClass } from "@dnd/shared";
export type IconName =
  | "spark"
  | "sword"
  | "dagger"
  | "wand"
  | "sun"
  | "bow"
  | "book"
  | "arrow"
  | "shield"
  | "heart"
  | "people"
  | "compass"
  | "die"
  | "close"
  | "copy"
  | "check"
  | "pack"
  | "move"
  | "moon";
const paths: Record<IconName, string> = {
  spark: "M12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5Z",
  sword: "m14 3 7-1-1 7L9 20l-5-5ZM7 13l5 5M3 21l4-4M2 18l4 4",
  dagger: "M18 2 21 5 11 17 7 13ZM5 11l8 8M3 21l5-5",
  wand: "m3 21 12-12m-3-2 5 5M18 1l1.2 3.8L23 6l-3.8 1.2L18 11l-1.2-3.8L13 6l3.8-1.2ZM6 3v4M4 5h4",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2",
  bow: "M5 3c17 0 17 18 0 18L15 12ZM3 12h18m-3-3 3 3-3 3",
  book: "M12 5v16M12 5C8 2 4 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-2-1-6-2-10 1Z",
  arrow: "M3 12h17m-6-6 6 6-6 6",
  shield: "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6ZM12 6v11",
  heart: "M12 21S2 15 2 8c0-6 8-7 10-1 2-6 10-5 10 1 0 7-10 13-10 13Z",
  people:
    "M8 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM2 21v-5a6 6 0 0 1 12 0v5M17 4a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5v3",
  compass: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM16 8l-2 6-6 2 2-6Z",
  die: "M12 1 22 7v10l-10 6L2 17V7ZM12 1 7 8l5 11 5-11ZM2 7l5 1 10 0 5-1M2 17l10 2 10-2M12 19v4",
  close: "m6 6 12 12M6 18 18 6",
  copy: "M8 8h13v13H8ZM16 4V2H2v14h2",
  check: "m4 12 5 5L21 5",
  pack: "M8 6V3h8v3M5 6h14l2 15H3ZM3 12h18M10 10v5h4v-5",
  move: "M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4",
  moon: "M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z",
};
export const classIcons: Record<CharacterClass, IconName> = {
  Fighter: "sword",
  Rogue: "dagger",
  Wizard: "wand",
  Cleric: "sun",
  Ranger: "bow",
};
export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <Icon name="die" />
      <span>
        Hearth <i>&</i> Hollow
      </span>
    </div>
  );
}
