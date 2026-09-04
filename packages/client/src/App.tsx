import { useGameSocket } from "./hooks/useGameSocket.js";
import { JoinScreen } from "./components/JoinScreen.js";
import { CharacterCreator } from "./components/CharacterCreator.js";
import { ChatLog } from "./components/ChatLog.js";
import { CharacterSheet } from "./components/CharacterSheet.js";
import { PartyPanel } from "./components/PartyPanel.js";
import { CombatPanel } from "./components/CombatPanel.js";
import { ActionBar } from "./components/ActionBar.js";

export function App() {
  const { state, actions } = useGameSocket();
  const { snapshot } = state;

  const banner = state.error && (
    <div className="banner" role="alert" onClick={actions.clearError}>
      {state.error} <span className="muted">(click to dismiss)</span>
    </div>
  );

  if (!snapshot) {
    return (
      <div className="app">
        {banner}
        <JoinScreen
          onSolo={(name) => actions.createSession(name, true)}
          onCreate={(name) => actions.createSession(name, false)}
          onJoin={(name, code) => actions.joinSession(name, code)}
        />
      </div>
    );
  }

  const you = snapshot.characters.find((c) => c.id === snapshot.youCharacterId) ?? null;

  if (!you) {
    return (
      <div className="app">
        {banner}
        <CharacterCreator onCreate={actions.createCharacter} />
      </div>
    );
  }

  const solo = snapshot.players.length === 1;

  return (
    <div className="app play">
      {banner}

      <header className="top-bar">
        <strong>AI Dungeon Master</strong>
        {!solo && (
          <span className="muted">
            Invite code: <code>{snapshot.joinCode}</code>
          </span>
        )}
        {snapshot.scene.location && <span className="muted">{snapshot.scene.location}</span>}
        <span className={`status ${state.connection}`}>{state.connection}</span>
      </header>

      <main className="play-area">
        <div className="story">
          <ChatLog feed={state.feed} streaming={state.streaming} dmThinking={state.dmThinking} />
          <ActionBar
            combat={snapshot.combat}
            youCharacterId={snapshot.youCharacterId}
            busy={state.dmThinking}
            onAct={actions.act}
            onCombatAct={actions.combatAct}
          />
        </div>

        <aside className="sidebar">
          <CharacterSheet character={you} />
          {snapshot.combat?.active && <CombatPanel combat={snapshot.combat} />}
          <PartyPanel
            players={snapshot.players}
            characters={snapshot.characters}
            youPlayerId={snapshot.youPlayerId}
            awaitingPlayerIds={snapshot.awaitingPlayerIds}
          />
        </aside>
      </main>
    </div>
  );
}
