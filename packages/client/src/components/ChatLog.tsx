import { useEffect, useRef } from "react";
import type { DiceRoll } from "@dnd/shared";
import type { FeedItem } from "../hooks/useGameSocket.js";

interface Props {
  feed: FeedItem[];
  streaming: string;
  dmThinking: boolean;
}

function RollLine({ roll }: { roll: DiceRoll }) {
  const discarded = roll.rolls.length > 1 ? ` (rolled ${roll.rolls.join(" / ")})` : "";
  const target = roll.dc === null ? "" : ` vs DC ${roll.dc}`;
  return (
    <div className={`feed-item roll outcome-${roll.outcome ?? "none"}`}>
      <strong>{roll.actor}</strong> rolls {roll.expression} for {roll.purpose}
      {target}: <strong>{roll.total}</strong>
      {discarded}
      {roll.outcome && <em> — {roll.outcome.replace("-", " ")}</em>}
    </div>
  );
}

export function ChatLog({ feed, streaming, dmThinking }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed.length, streaming, dmThinking]);

  return (
    <div className="chat-log">
      {feed.map((item) =>
        item.kind === "roll" ? (
          <RollLine key={item.id} roll={item.roll} />
        ) : (
          <div key={item.id} className={`feed-item ${item.message.authorType}`}>
            {item.message.authorType !== "dm" && <strong>{item.message.authorName}: </strong>}
            {item.message.content}
          </div>
        ),
      )}

      {streaming && <div className="feed-item dm streaming">{streaming}</div>}
      {dmThinking && !streaming && <div className="feed-item muted">The DM is thinking…</div>}

      <div ref={endRef} />
    </div>
  );
}
