import { CornerRightDown, ChevronUp, X } from "lucide-react";
import { useStore, type Bubble as BubbleModel } from "@/state/store";
import { getHost } from "@/hosts/resolve";
import { Composer } from "./Composer";
import { getRange } from "@/content/highlight";

interface BubbleProps {
  bubble: BubbleModel;
  active: boolean;
}

/** One tangent thread: quote, messages, streaming reply, composer. (PRD 7) */
export function Bubble({ bubble, active }: BubbleProps) {
  const { setActive, removeBubble, setCollapsed, setModel, ask, retry } = useStore();
  const usage = useStore((s) => s.usage);

  const busy = bubble.status === "sending" || bubble.status === "streaming";
  const hasFirstQuestion = bubble.messages.length > 0;

  const focusHighlight = () => {
    const range = getRange(bubble.id);
    const rect = range?.getBoundingClientRect();
    if (rect) {
      window.scrollTo({
        top: rect.top + window.scrollY - window.innerHeight / 3,
        behavior: "smooth"
      });
    }
  };

  const expand = () => {
    setCollapsed(bubble.id, false);
    setActive(bubble.id);
  };

  const lastUserText =
    bubble.status === "error"
      ? [...bubble.messages].reverse().find((m) => m.role === "user")?.content
      : undefined;

  return (
    <div
      className={`tg-bubble${active ? " tg-bubble--active" : ""}${bubble.collapsed ? " tg-bubble--collapsed" : ""}`}
      onMouseDown={() => {
        // Don't auto-expand on every mousedown — that raced the collapse toggle.
        if (!bubble.collapsed) setActive(bubble.id);
      }}
      role="group"
      aria-label={bubble.title}
    >
      <header className="tg-bubble-header">
        <button
          type="button"
          className="tg-icon-btn tg-expand-btn"
          title={bubble.collapsed ? "Expand" : "Collapse"}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (bubble.collapsed) expand();
            else setCollapsed(bubble.id, true);
          }}
        >
          {bubble.collapsed ? (
            <CornerRightDown size={14} strokeWidth={2.25} aria-hidden />
          ) : (
            <ChevronUp size={14} strokeWidth={2.25} aria-hidden />
          )}
        </button>
        <button
          type="button"
          className="tg-quote"
          title={bubble.collapsed ? "Expand" : "Scroll to highlight"}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (bubble.collapsed) expand();
            else focusHighlight();
          }}
        >
          <span className="tg-quote-text">{bubble.excerpt}</span>
        </button>
        <button
          type="button"
          className="tg-icon-btn tg-close"
          title="Close"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            removeBubble(bubble.id);
          }}
        >
          <X size={14} strokeWidth={2.25} aria-hidden />
        </button>
      </header>

      <div className="tg-bubble-body" aria-hidden={bubble.collapsed}>
        <div className="tg-bubble-body-inner">
          <div className="tg-messages">
            {bubble.messages.map((m, i) => (
              <div key={i} className={`tg-msg tg-msg--${m.role}`}>
                {m.content}
              </div>
            ))}
            {bubble.status === "streaming" && (
              <div className="tg-msg tg-msg--assistant tg-streaming">
                {bubble.streamingText}
                <span className="tg-caret" />
              </div>
            )}
            {bubble.status === "sending" && (
              <div className="tg-msg tg-msg--assistant tg-thinking">…</div>
            )}
            {bubble.status === "error" && bubble.error && (
              <ErrorState
                kind={bubble.error.kind}
                message={bubble.error.message}
                detail={bubble.error.detail}
                onRetry={() => retry(bubble.id)}
              />
            )}
          </div>

          <Composer
            disabled={busy}
            model={bubble.model}
            usage={usage}
            autoFocus={active && !hasFirstQuestion && !bubble.collapsed}
            initialValue={lastUserText}
            placeholder={hasFirstQuestion ? "Follow up…" : "Ask about this excerpt…"}
            showModelPicker={getHost().id === "claude"}
            onModelChange={(m) => setModel(bubble.id, m)}
            onSubmit={(text) => ask(bubble.id, text)}
          />
        </div>
      </div>
    </div>
  );
}

function ErrorState({
  kind,
  message,
  detail,
  onRetry
}: {
  kind: string;
  message?: string;
  detail?: string;
  onRetry: () => void;
}) {
  const text =
    kind === "auth"
      ? message || "Session expired. Reload the page to re-authenticate."
      : kind === "model"
        ? message || detail || "This model isn't available. Pick another from the dropdown."
        : kind === "rate_limit"
          ? message || `Rate limit reached${detail ? `: ${detail}` : "."}`
          : kind === "network"
            ? message || "No network. Your question is saved."
            : message || detail || "Something went wrong.";
  // Auth often needs a settings change (API key) or reload — still offer Retry.
  return (
    <div className={`tg-error tg-error--${kind}`}>
      <span className="tg-error-msg">{text}</span>
      <button type="button" className="tg-retry" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
