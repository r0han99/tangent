import { create } from "zustand";
import { SYSTEM_INSTRUCTION, TITLE_EXCERPT_CHARS } from "@/config";
import {
  ApiError,
  DEFAULT_MODEL_ID,
  type ChatMessage,
  type ThreadId,
  type Usage
} from "@/api/types";
import { createThread, sendMessage, streamReply, getUsage, archiveThread } from "@/api/client";
import { setHighlight, setHighlightActive, clearHighlight, clearAllHighlights } from "@/content/highlight";
import { getMessageIndex } from "@/content/reanchor";

export type BubbleStatus = "idle" | "sending" | "streaming" | "error";

export interface Bubble {
  id: string;
  /** Server thread id, created lazily on first send. */
  threadId: ThreadId | null;
  excerpt: string;
  /** Containing paragraph/block, passed as <context> to resolve references. */
  context: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  /** Live text of the in-flight assistant reply (not yet committed). */
  streamingText: string;
  status: BubbleStatus;
  error: ApiError | null;
  collapsed: boolean;
  /** Which `.standard-markdown` block owned the original highlight. */
  messageIndex: number;
  /** Desired top in document space; stacking uses live Range instead. */
  desiredTop: number;
  /** Anchor rect in page space, for popover mode. */
  anchorRect: { top: number; left: number; bottom: number; right: number };
  createdAt: number;
}

interface StoreState {
  bubbles: Bubble[];
  activeId: string | null;
  usage: Usage;
  defaultModel: string;
  /** When true, closing a bubble archives its underlying thread. (PRD 6.5) */
  archiveOnClose: boolean;
  /** Conversation currently hydrated into the store (for persistence). */
  conversationId: string | null;

  createBubble: (input: { excerpt: string; context: string; range: Range; rect: DOMRect }) => string;
  /** Replace in-memory bubbles after a restore (highlights already painted). */
  hydrateBubbles: (conversationId: string, bubbles: Bubble[]) => void;
  /** Clear all bubbles + highlights (e.g. leaving a conversation). */
  clearBubbles: () => void;
  removeBubble: (id: string) => void;
  setActive: (id: string | null) => void;
  toggleCollapsed: (id: string) => void;
  setCollapsed: (id: string, collapsed: boolean) => void;
  /** Collapse every idle expanded bubble (outside click). */
  collapseIdleBubbles: () => void;
  setModel: (id: string, model: string) => void;
  setDesiredTop: (id: string, top: number) => void;
  setDefaultModel: (model: string) => void;
  setArchiveOnClose: (value: boolean) => void;
  setConversationId: (id: string | null) => void;

  /** Submit a question (first turn or follow-up) in a bubble. */
  ask: (id: string, question: string) => Promise<void>;
  /** Retry the last user turn after an error, preserving typed text. (PRD 7) */
  retry: (id: string) => Promise<void>;

  refreshUsage: () => Promise<void>;
}

const titleFor = (excerpt: string): string => {
  const trimmed = excerpt.replace(/\s+/g, " ").trim();
  const slice = trimmed.slice(0, TITLE_EXCERPT_CHARS);
  return `Tangent: ${slice}${trimmed.length > TITLE_EXCERPT_CHARS ? "…" : ""}`;
};

/**
 * First-turn prompt. We pass SYSTEM_INSTRUCTION via the endpoint's system field
 * (opts.system) AND fold it in here as a guaranteed fallback, since the web
 * completion endpoint's handling of a separate system field isn't verifiable.
 * The <context> block is included only when it adds something beyond the excerpt.
 */
const composeFirstPrompt = (context: string, excerpt: string, question: string): string => {
  const parts = [SYSTEM_INSTRUCTION];
  if (context) parts.push(`<context>\n${context}\n</context>`);
  parts.push(`<excerpt>\n${excerpt}\n</excerpt>`);
  parts.push(`Question: ${question}`);
  return parts.join("\n\n");
};

export const useStore = create<StoreState>((set, get) => ({
  bubbles: [],
  activeId: null,
  usage: { percent: null },
  defaultModel: DEFAULT_MODEL_ID,
  archiveOnClose: false,
  conversationId: null,

  createBubble: ({ excerpt, context, range, rect }) => {
    const id = crypto.randomUUID();
    const bubble: Bubble = {
      id,
      threadId: null,
      excerpt,
      context,
      title: titleFor(excerpt),
      model: get().defaultModel,
      messages: [],
      streamingText: "",
      status: "idle",
      error: null,
      collapsed: false,
      messageIndex: getMessageIndex(range),
      desiredTop: rect.top + window.scrollY,
      anchorRect: {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        bottom: rect.bottom + window.scrollY,
        right: rect.right + window.scrollX
      },
      createdAt: Date.now()
    };
    setHighlight(id, range, true);
    set((s) => ({ bubbles: [...s.bubbles, bubble], activeId: id }));
    return id;
  },

  hydrateBubbles: (conversationId, bubbles) => {
    // Highlights are painted by the persistence controller before hydrate.
    set({
      conversationId,
      bubbles,
      activeId: null
    });
  },

  clearBubbles: () => {
    clearAllHighlights();
    set({ bubbles: [], activeId: null });
  },

  removeBubble: (id) => {
    const bubble = get().bubbles.find((b) => b.id === id);
    clearHighlight(id);
    set((s) => ({
      bubbles: s.bubbles.filter((b) => b.id !== id),
      activeId: s.activeId === id ? null : s.activeId
    }));
    if (bubble?.threadId && get().archiveOnClose) {
      void archiveThread(bubble.threadId).catch(() => {
        /* best-effort */
      });
    }
  },

  setActive: (id) => {
    const prev = get().activeId;
    if (prev && prev !== id) setHighlightActive(prev, false);
    if (id) {
      setHighlightActive(id, true);
      set((s) => ({
        activeId: id,
        bubbles: s.bubbles.map((b) => (b.id === id ? { ...b, collapsed: false } : b))
      }));
    } else {
      set({ activeId: null });
    }
  },

  toggleCollapsed: (id) =>
    set((s) => ({
      bubbles: s.bubbles.map((b) => (b.id === id ? { ...b, collapsed: !b.collapsed } : b))
    })),

  setCollapsed: (id, collapsed) =>
    set((s) => ({
      bubbles: s.bubbles.map((b) => (b.id === id ? { ...b, collapsed } : b)),
      activeId: collapsed && s.activeId === id ? null : s.activeId
    })),

  collapseIdleBubbles: () =>
    set((s) => ({
      bubbles: s.bubbles.map((b) =>
        b.collapsed || b.status === "sending" || b.status === "streaming"
          ? b
          : { ...b, collapsed: true }
      ),
      activeId: null
    })),

  setModel: (id, model) =>
    set((s) => ({
      bubbles: s.bubbles.map((b) => (b.id === id ? { ...b, model } : b))
    })),

  setDesiredTop: (id, top) =>
    set((s) => ({
      bubbles: s.bubbles.map((b) => (b.id === id ? { ...b, desiredTop: top } : b))
    })),

  setDefaultModel: (model) => set({ defaultModel: model }),

  setArchiveOnClose: (value) => set({ archiveOnClose: value }),

  setConversationId: (id) => set({ conversationId: id }),

  ask: async (id, question) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    const bubble = get().bubbles.find((b) => b.id === id);
    if (!bubble) return;

    const isFirst = bubble.messages.length === 0;
    patch(set, id, (b) => ({
      messages: [...b.messages, { role: "user", content: trimmed }],
      status: "sending",
      error: null,
      streamingText: ""
    }));

    try {
      let threadId = bubble.threadId;
      if (!threadId) {
        threadId = await createThread(bubble.title, bubble.model);
        patch(set, id, () => ({ threadId }));
      }

      const prompt = isFirst
        ? composeFirstPrompt(bubble.context, bubble.excerpt, trimmed)
        : trimmed;
      const response = await sendMessage(threadId, prompt, {
        model: bubble.model,
        // Try the endpoint's system field on the first turn; folded copy above
        // is the fallback if it's ignored. Follow-ups inherit thread history.
        system: isFirst ? SYSTEM_INSTRUCTION : undefined
      });

      patch(set, id, () => ({ status: "streaming" }));
      const full = await streamReply(response, (delta) => {
        patch(set, id, (b) => ({ streamingText: b.streamingText + delta }));
      });

      patch(set, id, (b) => ({
        messages: [...b.messages, { role: "assistant", content: full }],
        streamingText: "",
        status: "idle"
      }));
      void get().refreshUsage();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("unknown", String(e));
      patch(set, id, () => ({ status: "error", error: err, streamingText: "" }));
    }
  },

  retry: async (id) => {
    const bubble = get().bubbles.find((b) => b.id === id);
    if (!bubble) return;
    const lastUser = [...bubble.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    patch(set, id, (b) => ({
      messages: b.messages.filter((m) => m !== lastUser),
      error: null
    }));
    await get().ask(id, lastUser.content);
  },

  refreshUsage: async () => {
    const usage = await getUsage();
    set({ usage });
  }
}));

function patch(
  set: (fn: (s: StoreState) => Partial<StoreState>) => void,
  id: string,
  update: (b: Bubble) => Partial<Bubble>
): void {
  set((s) => ({
    bubbles: s.bubbles.map((b) => (b.id === id ? { ...b, ...update(b) } : b))
  }));
}
