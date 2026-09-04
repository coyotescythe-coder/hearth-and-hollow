import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DiceRoll } from "@dnd/shared";
import type { FeedItem } from "../hooks/useGameSocket.js";
import { Icon } from "./Icon.js";

const outcomeLabels = {
  "critical-success": "Natural 20 · Against all odds",
  "critical-failure": "Natural 1 · Fortune turns",
  success: "Success",
  failure: "Failure",
};
export function RollCard({
  roll,
  animate = true,
}: {
  roll: DiceRoll;
  animate?: boolean;
}) {
  // Kept faces are supplied by the server, including duplicates in multi-die rolls.
  const remaining = [...roll.kept];
  const faces = roll.rolls.map((face) => {
    const index = remaining.indexOf(face);
    if (index >= 0) remaining.splice(index, 1);
    return { face, kept: index >= 0 };
  });
  return (
    <article
      className={`roll-card outcome-${roll.outcome ?? "none"} ${animate ? "roll-arrives" : ""}`}
      aria-label={`${roll.actor} rolls ${roll.total}${roll.outcome ? ", " + outcomeLabels[roll.outcome] : ""}`}
    >
      <div
        className="roll-die"
        title={roll.kept.length === 1 ? "Kept face" : "Dice total"}
      >
        <Icon name="die" />
        <strong>{roll.kept.length === 1 ? roll.kept[0] : roll.total}</strong>
      </div>
      <div className="roll-body">
        <div className="roll-caption">
          <span>
            {roll.actor} <span className="muted">/ {roll.expression}</span>
          </span>
          {roll.dc !== null && <span className="dc">DC {roll.dc}</span>}
        </div>
        <h3>{roll.purpose}</h3>
        <div className="roll-breakdown">
          {faces.map(({ face, kept }, i) => (
            <span
              key={i}
              className={kept ? "kept-face" : "discarded-face"}
              title={kept ? "Kept" : "Discarded"}
            >
              {face}
              <span className="sr-only"> {kept ? "kept" : "discarded"}</span>
            </span>
          ))}
          {roll.modifier !== 0 && (
            <span>
              {roll.modifier > 0 ? "+" : "−"} {Math.abs(roll.modifier)}
            </span>
          )}
          <span>
            = <b>{roll.total}</b>
          </span>
          {roll.advantage !== "none" && (
            <span className="advantage">{roll.advantage}</span>
          )}
        </div>
        {roll.outcome && (
          <p className="roll-outcome">
            <Icon
              name={
                roll.outcome === "critical-success"
                  ? "sun"
                  : roll.outcome === "critical-failure"
                    ? "moon"
                    : roll.outcome === "success"
                      ? "check"
                      : "close"
              }
            />
            {outcomeLabels[roll.outcome]}
          </p>
        )}
      </div>
    </article>
  );
}
const Prose = memo(function Prose({
  text,
  chunks,
  active = false,
}: {
  text: string;
  chunks?: string[];
  active?: boolean;
}) {
  return (
    <div className={`prose ${active ? "streaming" : ""}`}>
      {chunks?.length
        ? chunks.map((chunk, i) => (
            <span className="ink-arrives" key={i}>
              {chunk}
            </span>
          ))
        : text}
      {active && <span className="ink-cursor" aria-hidden="true" />}
    </div>
  );
});
interface Props {
  feed: FeedItem[];
  streaming: string;
  streamId: string | null;
  chunks: string[];
  dmThinking: boolean;
  location: string;
}
export function ChatLog({
  feed,
  streaming,
  streamId,
  chunks,
  dmThinking,
  location,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const initialIds = useRef(new Set(feed.map((f) => f.id)));
  const [away, setAway] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  // A live entry and its committed message share one keyed list. React keeps
  // their prose DOM, so narration_end never replays the word-entry animation.
  const entries = [
    ...feed,
    ...(streaming && streamId
      ? [{ kind: "stream" as const, id: streamId }]
      : []),
  ];
  const jump = () => {
    follow.current = true;
    setAway(false);
    setHasNew(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  useLayoutEffect(() => {
    if (follow.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    } else setHasNew(true);
  }, [feed.length, streaming, dmThinking]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (follow.current) el.scrollTop = el.scrollHeight;
    });
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="story-scroll-wrap">
      <div
        ref={scrollRef}
        className="story-scroll"
        tabIndex={0}
        aria-label="Adventure chronicle"
        onScroll={(e) => {
          const el = e.currentTarget;
          const near = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
          follow.current = near;
          setAway(!near);
          if (near) setHasNew(false);
        }}
      >
        <div className="story-pages">
          <header className="chapter-heading">
            <div className="chapter-rule">
              <span />
              <Icon name="spark" />
              <span />
            </div>
            <p className="eyebrow">The adventure unfolds</p>
            <h1>{location || "An unwritten road"}</h1>
            <p className="chapter-subtitle">
              A chronicle of choices & consequences
            </p>
          </header>
          <div className="feed">
            {entries.map((item) =>
              item.kind === "stream" ? (
                <article className="narration" key={item.id}>
                  <div className="narrator-label">
                    <Icon name="spark" />
                    <span>The Dungeon Master</span>
                    <span className="live-ink">Narrating</span>
                  </div>
                  <Prose text={streaming} chunks={chunks} active />
                </article>
              ) : item.kind === "roll" ? (
                <RollCard
                  key={item.id}
                  roll={item.roll}
                  animate={!initialIds.current.has(item.id)}
                />
              ) : item.message.authorType === "dm" ? (
                <article className="narration" key={item.id}>
                  <div className="narrator-label">
                    <Icon name="spark" />
                    <span>The Dungeon Master</span>
                  </div>
                  <Prose text={item.message.content} chunks={item.chunks} />
                </article>
              ) : item.message.authorType === "player" ? (
                <article className="player-action" key={item.id}>
                  <Icon name="arrow" />
                  <div>
                    <span className="eyebrow">{item.message.authorName}</span>
                    <p>{item.message.content}</p>
                  </div>
                </article>
              ) : (
                <details key={item.id} className="system-note">
                  <summary>
                    <Icon name="book" />
                    {item.message.content.startsWith("The DM stumbled")
                      ? "The storyteller needs a moment"
                      : item.message.authorName === "Chronicle"
                        ? "An earlier chapter"
                        : item.message.content}
                  </summary>
                  {(item.message.content.startsWith("The DM stumbled") ||
                    item.message.authorName === "Chronicle") && (
                    <p>{item.message.content}</p>
                  )}
                </details>
              ),
            )}
            {dmThinking && !streaming && (
              <div className="thinking" role="status">
                <span className="thinking-sigil">
                  <Icon name="spark" />
                </span>
                <span>
                  The world holds its breath
                  <span className="thinking-dots">…</span>
                </span>
              </div>
            )}
            {feed.length === 0 && !dmThinking && !streaming && (
              <div className="empty-story">
                <Icon name="book" />
                <p>A blank page. A world of possibilities.</p>
                <span>Your story begins with a single choice.</span>
              </div>
            )}
          </div>
          <div className="page-end" aria-hidden="true">
            ◇
          </div>
        </div>
      </div>
      {away && (
        <button className="jump-latest" onClick={jump}>
          {hasNew ? "New words below" : "Return to the story"}
          <Icon name="arrow" />
        </button>
      )}
      <span className="sr-only" role="status">
        {dmThinking
          ? "The Dungeon Master is narrating."
          : "The story is ready."}
      </span>
    </div>
  );
}
