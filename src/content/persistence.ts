import { getConversationId } from "./conversationId";
import { findExcerptRange } from "./reanchor";
import { setHighlight } from "./highlight";
import {
  bubbleFromPersisted,
  createPersister,
  loadConversation,
  type PersistedBubble
} from "@/state/persist";
import { useStore } from "@/state/store";

const RESTORE_ATTEMPTS = 12;
const RESTORE_GAP_MS = 400;

/**
 * Soft persistence controller (PRD §10, level B).
 *
 * - Saves bubbles per conversationId to chrome.storage.local
 * - On load / SPA navigation, re-finds each excerpt and reopens collapsed chips
 * - Skips silently when the excerpt is gone
 */
export function startPersistence(): () => void {
  const persister = createPersister(() => getConversationId());
  let currentId: string | null = null;
  let restoreGeneration = 0;
  let stopped = false;

  const unsubStore = useStore.subscribe((state, prev) => {
    if (state.bubbles === prev.bubbles) return;
    // Only persist once we know which conversation we're on.
    if (!getConversationId()) return;
    persister.schedule(state.bubbles);
  });

  const onUrlChange = () => {
    void handleNavigation();
  };

  // claude.ai is an SPA — patch history so chat switches re-hydrate.
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = ((...args: Parameters<History["pushState"]>) => {
    origPush(...args);
    onUrlChange();
  }) as History["pushState"];
  history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    origReplace(...args);
    onUrlChange();
  }) as History["replaceState"];
  window.addEventListener("popstate", onUrlChange);

  void handleNavigation();

  async function handleNavigation(): Promise<void> {
    if (stopped) return;
    const nextId = getConversationId();
    if (nextId === currentId) return;

    const prevId = currentId;
    const existing = useStore.getState().bubbles;

    // Flush the conversation we're leaving.
    if (prevId) {
      await persister.flush(existing);
    }

    // New chat → /chat/<uuid>: keep in-memory bubbles and bind them to the new id.
    if (!prevId && nextId && existing.length > 0) {
      currentId = nextId;
      useStore.getState().setConversationId(nextId);
      await persister.flush(existing);
      return;
    }

    currentId = nextId;
    useStore.getState().clearBubbles();
    useStore.getState().setConversationId(nextId);

    if (!nextId) return;

    const generation = ++restoreGeneration;
    await restoreWhenReady(nextId, generation);
  }

  async function restoreWhenReady(conversationId: string, generation: number): Promise<void> {
    const saved = await loadConversation(conversationId);
    if (!saved.length || stopped || generation !== restoreGeneration) return;

    for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
      if (stopped || generation !== restoreGeneration) return;
      if (document.querySelector("main .standard-markdown")) {
        const restored = reanchorAll(saved);
        if (restored.length > 0) {
          useStore.getState().hydrateBubbles(conversationId, restored);
          return;
        }
        // DOM is up but excerpts aren't found yet (still streaming in) — keep trying.
        // On the final attempt, leave storage intact rather than wiping it.
        if (attempt === RESTORE_ATTEMPTS - 1) {
          console.info(
            `[Tangent] Could not re-anchor ${saved.length} saved bubble(s); leaving storage intact.`
          );
          return;
        }
      }
      await sleep(RESTORE_GAP_MS);
    }
  }

  return () => {
    stopped = true;
    unsubStore();
    window.removeEventListener("popstate", onUrlChange);
    history.pushState = origPush;
    history.replaceState = origReplace;
    void persister.flush(useStore.getState().bubbles);
  };
}

function reanchorAll(saved: PersistedBubble[]) {
  const out = [];
  for (const p of saved) {
    const range = findExcerptRange(p.excerpt, p.messageIndex);
    if (!range) continue;
    setHighlight(p.id, range, false);
    out.push(bubbleFromPersisted(p, range));
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}
