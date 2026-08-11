import { PERSIST_DEBOUNCE_MS, STORAGE_KEYS } from "@/config";
import type { ChatMessage, ThreadId } from "@/api/types";
import type { Bubble } from "./store";
import { migrateLegacy } from "./migrate";
import { extensionAlive, localGet, localSet } from "@/util/chrome";

export { migrateLegacy } from "./migrate";

/** Serializable bubble record (no live Range / DOMRect). */
export interface PersistedBubble {
  id: string;
  threadId: string | null;
  excerpt: string;
  context: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  collapsed: boolean;
  /** Index of host message block that owned the highlight. */
  messageIndex: number;
  createdAt: number;
}

export interface PersistedConversation {
  conversationId: string;
  bubbles: PersistedBubble[];
  updatedAt: number;
}

type PersistMap = Record<string, PersistedConversation>;

export function toPersisted(b: Bubble): PersistedBubble {
  return {
    id: b.id,
    threadId: b.threadId,
    excerpt: b.excerpt,
    context: b.context,
    title: b.title,
    model: b.model,
    messages: b.messages,
    collapsed: b.collapsed,
    messageIndex: b.messageIndex,
    createdAt: b.createdAt
  };
}

async function readMap(): Promise<PersistMap> {
  if (!extensionAlive()) return {};
  await migrateLegacy();
  if (!extensionAlive()) return {};
  const res = await localGet<Record<string, PersistMap>>(STORAGE_KEYS.persist);
  const raw = res?.[STORAGE_KEYS.persist];
  return raw && typeof raw === "object" ? raw : {};
}

async function writeMap(map: PersistMap): Promise<void> {
  if (!extensionAlive()) return;
  await localSet({ [STORAGE_KEYS.persist]: map });
}

export async function loadConversation(
  conversationId: string
): Promise<PersistedBubble[]> {
  const map = await readMap();
  return map[conversationId]?.bubbles ?? [];
}

export async function saveConversation(
  conversationId: string,
  bubbles: Bubble[]
): Promise<void> {
  const map = await readMap();
  if (bubbles.length === 0) {
    delete map[conversationId];
  } else {
    map[conversationId] = {
      conversationId,
      bubbles: bubbles.map(toPersisted),
      updatedAt: Date.now()
    };
  }
  await writeMap(map);
}

/** Debounced saver bound to one conversation id getter. */
export function createPersister(getConversationId: () => string | null) {
  let timer: number | null = null;
  let pendingId: string | null = null;
  let pendingBubbles: Bubble[] | null = null;

  const write = async (id: string, bubbles: Bubble[]) => {
    if (!extensionAlive()) return;
    try {
      await saveConversation(id, bubbles);
    } catch {
      /* context invalidated / storage unavailable */
    }
  };

  return {
    schedule(bubbles: Bubble[], conversationId?: string | null) {
      if (!extensionAlive()) return;
      const id = conversationId !== undefined ? conversationId : getConversationId();
      if (!id) return;
      pendingId = id;
      pendingBubbles = bubbles;
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        const flushId = pendingId;
        const flushBubbles = pendingBubbles;
        pendingId = null;
        pendingBubbles = null;
        if (flushId && flushBubbles) void write(flushId, flushBubbles);
      }, PERSIST_DEBOUNCE_MS);
    },
    async flush(bubbles: Bubble[], conversationId?: string | null) {
      const id = conversationId !== undefined ? conversationId : getConversationId();
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
      pendingId = null;
      pendingBubbles = null;
      if (!id || !extensionAlive()) return;
      await write(id, bubbles);
    },
    /** Drop a pending debounced write without touching storage. */
    cancel() {
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
      pendingId = null;
      pendingBubbles = null;
    }
  };
}

/** Rebuild a store Bubble shell from persistence (Range applied by caller). */
export function bubbleFromPersisted(
  p: PersistedBubble,
  range: Range
): Bubble {
  const rect = range.getBoundingClientRect();
  return {
    id: p.id,
    threadId: (p.threadId as ThreadId | null) ?? null,
    excerpt: p.excerpt,
    context: p.context ?? "",
    title: p.title,
    model: p.model,
    messages: p.messages ?? [],
    streamingText: "",
    status: "idle",
    error: null,
    // Restore as collapsed margin chips so returning to a thread stays calm.
    collapsed: true,
    messageIndex: p.messageIndex ?? -1,
    desiredTop: rect.top + window.scrollY,
    anchorRect: {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      bottom: rect.bottom + window.scrollY,
      right: rect.right + window.scrollX
    },
    createdAt: p.createdAt
  };
}
