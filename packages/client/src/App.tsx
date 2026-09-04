import { useEffect, useState } from "react";
import { useGameSocket, type GameState } from "./hooks/useGameSocket.js";
import { JoinScreen } from "./components/JoinScreen.js";
import { CharacterCreator } from "./components/CharacterCreator.js";
import { ChatLog } from "./components/ChatLog.js";
import { CharacterSheet } from "./components/CharacterSheet.js";
import { PartyPanel } from "./components/PartyPanel.js";
import { CombatPanel } from "./components/CombatPanel.js";
import { ActionBar } from "./components/ActionBar.js";
import { Brand, Icon } from "./components/Icon.js";
import { useHitEffect } from "./hooks/useHitEffect.js";
import type { Character, SessionSnapshot } from "@dnd/shared";

function Connection({ state }: { state: GameState["connection"] }) {
  return (
    <span className={`connection ${state}`} role="status">
      <i />
      {state === "open"
        ? "At the table"
        : state === "connecting"
          ? "Connecting…"
          : "Reconnecting…"}
    </span>
  );
}
function InviteCode({ code }: { code: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 2500);
    return () => clearTimeout(timer);
  }, [copyState]);
  return (
    <button
      className="invite-code"
      title="Copy invite code"
      onClick={() => {
        void navigator.clipboard
          .writeText(code)
          .then(() => setCopyState("copied"))
          .catch(() => setCopyState("failed"));
      }}
    >
      <span>
        {copyState === "copied"
          ? "Copied"
          : copyState === "failed"
            ? "Invite code"
            : "Invite friends"}
      </span>
      <strong>{code}</strong>
      <Icon name={copyState === "copied" ? "check" : "copy"} />
    </button>
  );
}
function Play({
  state,
  snapshot,
  you,
  actions,
}: {
  state: GameState;
  snapshot: SessionSnapshot;
  you: Character;
  actions: ReturnType<typeof useGameSocket>["actions"];
}) {
  const [panel, setPanel] = useState<"story" | "scene" | "character">("story");
  const [largeType, setLargeType] = useState(false);
  const hit = useHitEffect(you.hpCurrent);
  const combat = snapshot.combat?.active ? snapshot.combat : null;
  const current = combat?.participants[combat.currentTurnIdx];
  const yourTurn = Boolean(current && current.characterId === you.id);
  const party = state.partySession || snapshot.players.length > 1;
  const waitingForParty =
    snapshot.awaitingPlayerIds.length > 0 &&
    !snapshot.awaitingPlayerIds.includes(snapshot.youPlayerId);
  return (
    <div
      className={`app play ${combat ? "in-combat" : ""} ${yourTurn ? "my-turn" : ""} ${largeType ? "large-type" : ""}`}
    >
      {hit && (
        <>
          <div key={hit.key} className="hit-vignette" aria-hidden="true" />
          <span className="sr-only" role="status">
            You take {hit.amount} damage. {you.hpCurrent} hit points remain.
          </span>
        </>
      )}
      <header className="top-bar">
        <Brand />
        <div className="table-mode">
          <Icon name={combat ? "sword" : "compass"} />
          <span>
            {combat
              ? `In combat · Round ${combat.round}`
              : party
                ? "A shared adventure"
                : "A solo adventure"}
          </span>
        </div>
        <div className="top-actions">
          {party && <InviteCode code={snapshot.joinCode} />}
          <Connection state={state.connection} />
          <button
            className="type-control"
            aria-label="Larger story text"
            aria-pressed={largeType}
            onClick={() => setLargeType(!largeType)}
          >
            Aa
          </button>
        </div>
      </header>
      {state.error && (
        <div className="banner" role="alert">
          <span>{state.error}</span>
          <button aria-label="Dismiss error" onClick={actions.clearError}>
            <Icon name="close" />
          </button>
        </div>
      )}
      <nav className="mobile-tabs" aria-label="Adventure panels">
        {(["scene", "story", "character"] as const).map((p) => (
          <button
            key={p}
            aria-pressed={panel === p}
            onClick={() => setPanel(p)}
          >
            <Icon
              name={
                p === "scene" ? "compass" : p === "story" ? "book" : "shield"
              }
            />
            {p === "scene"
              ? combat
                ? "Battle"
                : "The world"
              : p === "story"
                ? "The story"
                : `${you.hpCurrent}/${you.hpMax} HP`}
          </button>
        ))}
      </nav>
      <main className={`play-area mobile-${panel}`}>
        <aside className="world-rail" aria-label="The world">
          <div className="world-illustration">
            <img src="/hollow.svg" alt="" />
            <div className="world-label">
              <span className="eyebrow">
                {combat
                  ? "Steel has been drawn"
                  : "Somewhere beyond the familiar"}
              </span>
              <Icon name={combat ? "sword" : "compass"} />
            </div>
          </div>
          <div className="world-content">
            <div className="scene-meta">
              <span className="eyebrow">Your surroundings</span>
              <h2>{snapshot.scene.location || "The threshold"}</h2>
              <p>
                {snapshot.scene.summary ||
                  "The path ahead is waiting to be discovered."}
              </p>
            </div>
            {combat && <CombatPanel combat={combat} youCharacterId={you.id} />}
            {Object.keys(snapshot.scene.flags).length > 0 && (
              <details className="scene-facts">
                <summary>
                  Things to remember{" "}
                  <span>{Object.keys(snapshot.scene.flags).length}</span>
                </summary>
                <dl>
                  {Object.entries(snapshot.scene.flags).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key.replaceAll("_", " ")}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            <div className="rail-footer">
              <Icon name="spark" />
              <span>
                There is always more
                <br />
                than meets the eye.
              </span>
            </div>
          </div>
        </aside>
        <section className="story" aria-label="The story">
          <div className="story-toolbar">
            <span className="eyebrow">
              <Icon name="book" /> The chronicle
            </span>
            <span className="muted small">
              {combat
                ? yourTurn && !state.dmThinking
                  ? "Your move"
                  : "In the thick of it"
                : "One choice at a time"}
            </span>
          </div>
          {combat && (
            <div
              key={`${combat.round}-${combat.currentTurnIdx}-${state.dmThinking}`}
              className={`battle-strip ${yourTurn && !state.dmThinking ? "ready" : ""}`}
              role="status"
            >
              <Icon name="sword" />
              <span>
                {yourTurn && !state.dmThinking
                  ? "Your turn, " + you.name + "."
                  : current?.name
                    ? current.name + " holds the moment."
                    : "Combat begins."}
              </span>
              <span>ROUND {combat.round}</span>
            </div>
          )}
          <ChatLog
            feed={state.feed}
            streaming={state.streaming}
            streamId={state.streamId}
            chunks={state.streamChunks}
            dmThinking={state.dmThinking}
            location={snapshot.scene.location}
          />
          <ActionBar
            combat={combat}
            youCharacterId={you.id}
            busy={state.dmThinking}
            connected={state.connection === "open"}
            pending={state.pending}
            waitingForParty={waitingForParty}
            onAct={actions.act}
            onCombatAct={actions.combatAct}
          />
        </section>
        <aside className="character-rail">
          <CharacterSheet character={you} />
          {party && (
            <PartyPanel
              players={snapshot.players}
              characters={snapshot.characters}
              youPlayerId={snapshot.youPlayerId}
              awaitingPlayerIds={snapshot.awaitingPlayerIds}
            />
          )}
        </aside>
      </main>
    </div>
  );
}
export function App() {
  const { state, actions } = useGameSocket();
  const { snapshot } = state;
  const you = snapshot?.characters.find(
    (c) => c.id === snapshot.youCharacterId,
  );
  if (snapshot && you)
    return (
      <Play state={state} snapshot={snapshot} you={you} actions={actions} />
    );
  return (
    <div className="app">
      {state.error && (
        <div className="banner" role="alert">
          <span>{state.error}</span>
          <button aria-label="Dismiss error" onClick={actions.clearError}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {!snapshot ? (
        <>
          <div className="landing-connection">
            <Connection state={state.connection} />
          </div>
          <JoinScreen
            connected={state.connection === "open"}
            pending={state.pending}
            onSolo={(name) => actions.createSession(name, true)}
            onCreate={(name) => actions.createSession(name, false)}
            onJoin={actions.joinSession}
          />
        </>
      ) : (
        <>
          <header className="top-bar">
            <Brand />
            <span className="setup-step">Your story / Create a character</span>
            <div className="top-actions">
              {state.partySession && <InviteCode code={snapshot.joinCode} />}
              <Connection state={state.connection} />
            </div>
          </header>
          <CharacterCreator
            disabled={state.connection !== "open" || state.pending}
            onCreate={actions.createCharacter}
          />
        </>
      )}
    </div>
  );
}
