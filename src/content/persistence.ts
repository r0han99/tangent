import { getPersistConversationId } from "./conversationId";
import { getHost } from "@/hosts/resolve";
import { findExcerptRange } from "./reanchor";
import { setHighlight } from "./highlight";
import {
  bubbleFromPersisted,
  createPersister,
  loadConversation,
  type PersistedBubble
} from "@/state/persist";
import { useStore } from "@/state/store";
import { extensionAlive } from "@/util/chrome";

const RESTORE_ATTEMPTS = 8;
const RESTORE_GAP_MS = 500;
/** Let the host SPA finish its own transition before we touch the DOM. */
const NAV_DEBOUNCE_MS = 350;
/** ChatGPT/Gemini often navigate without going through our history wrappers. */
const LOCATION_POLL_MS = 1000;

/**
 * Soft persistence controller (PRD §10, level B).
 *
 * - Saves bubbles per conversationId to chrome.storage.local
 * - On load / SPA navigation, re-finds each excerpt and reopens collapsed chips
 * - Skips silently when the excerpt is gone
 */
export function startPersistence(): () => void {
  const persister = createPersister(() => getPersistConversationId());
  let currentId: string | null = null;
  let restoreGeneration = 0;
  /**
   * While restoring, never persist an empty bubble list (that used to wipe
   * storage). Non-empty user edits still save immediately.
   */
  let blockEmptyPersist = false;
  let stopped = false;
  let navQueue: Promise<void> = Promise.resolve();
  let navDebounce: number | null = null;

  const unsubStore = useStore.subscribe((state, prev) => {
    if (state.bubbles === prev.bubbles) return;
    if (!currentId) return;
    if (blockEmptyPersist && state.bubbles.length === 0) return;
    if (!extensionAlive()) return;
    persister.schedule(state.bubbles, currentId);
  });

  let stopPersistence: (() => void) | null = null;

  const onUrlChange = () => {
    if (!extensionAlive()) {
      stopPersistence?.();
      return;
    }
    // ChatGPT fires many push/replaceState calls per click — coalesce them so
    // we don't thrash clear/restore on the main thread during their transition.
    if (navDebounce != null) window.clearTimeout(navDebounce);
    navDebounce = window.setTimeout(() => {
      navDebounce = null;
      navQueue = navQueue.then(() => handleNavigation()).catch(() => {});
    }, NAV_DEBOUNCE_MS);
  };

  // Host chats are SPAs — patch history so chat switches re-hydrate.
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

  // Poll as a backstop — avoid Navigation API (it double-fires with history
  // and adds work during ChatGPT's already-heavy soft navigations).
  let lastHref = location.href;
  const pollTimer = window.setInterval(() => {
    if (stopped) return;
    if (!extensionAlive()) {
      stopPersistence?.();
      return;
    }
    if (location.href !== lastHref) {
      lastHref = location.href;
      onUrlChange();
      return;
    }
    const id = getPersistConversationId();
    if (id !== currentId) onUrlChange();
  }, LOCATION_POLL_MS);

  // Hard refresh / tab close — debounce alone can miss the last edit.
  const onPageHide = () => {
    if (!currentId || !extensionAlive()) return;
    const bubbles = useStore.getState().bubbles;
    if (blockEmptyPersist && bubbles.length === 0) return;
    void persister.flush(bubbles, currentId);
  };
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("beforeunload", onPageHide);

  void handleNavigation();

  async function handleNavigation(): Promise<void> {
    if (stopped) return;
    const nextId = getPersistConversationId();
    if (nextId === currentId) return;

    const prevId = currentId;
    const existing = useStore.getState().bubbles;

    // New chat → /c/<uuid>: keep live bubbles/highlights and bind them to the new id.
    if (!prevId && nextId && existing.length > 0) {
      persister.cancel();
      currentId = nextId;
      useStore.getState().setConversationId(nextId);
      blockEmptyPersist = false;
      void persister.flush(existing, nextId);
      return;
    }

    // Clear UI immediately so previous-thread chips never float over the new chat.
    persister.cancel();
    blockEmptyPersist = true;
    currentId = nextId;
    useStore.getState().clearBubbles();
    useStore.getState().setConversationId(nextId);

    // Don't await storage on the critical path — ChatGPT needs the main thread.
    if (prevId && existing.length > 0) {
      void persister.flush(existing, prevId);
    }

    if (!nextId) {
      blockEmptyPersist = false;
      return;
    }

    const generation = ++restoreGeneration;
    await restoreWhenReady(nextId, generation);
    if (stopped || generation !== restoreGeneration) return;

    blockEmptyPersist = false;
    const live = useStore.getState().bubbles;
    if (live.length > 0) {
      void persister.flush(live, nextId);
    }
  }

  async function restoreWhenReady(conversationId: string, generation: number): Promise<void> {
    const saved = await loadConversation(conversationId);
    if (!saved.length || stopped || generation !== restoreGeneration) return;

    // Give the host a beat to paint the new transcript before we scan it.
    await sleep(RESTORE_GAP_MS);
    if (stopped || generation !== restoreGeneration) return;
    if (getPersistConversationId() !== conversationId) return;

    for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
      if (stopped || generation !== restoreGeneration) return;
      if (getPersistConversationId() !== conversationId) return;
      if (useStore.getState().bubbles.length > 0) return;

      const ready = Boolean(document.querySelector(getHost().messageBlockSelector));
      if (ready || attempt >= 2) {
        const restored = await reanchorAll(saved, () => {
          if (stopped || generation !== restoreGeneration) return false;
          if (getPersistConversationId() !== conversationId) return false;
          if (useStore.getState().bubbles.length > 0) return false;
          return true;
        });
        if (!restored) return;
        if (restored.length > 0) {
          if (useStore.getState().bubbles.length > 0) return;
          useStore.getState().hydrateBubbles(conversationId, restored);
          return;
        }
        if (attempt === RESTORE_ATTEMPTS - 1) {
          console.info(
            `[Offthread] Could not re-anchor ${saved.length} saved bubble(s); leaving storage intact.`
          );
          return;
        }
      }
      await sleep(RESTORE_GAP_MS);
    }
  }

  stopPersistence = () => {
    if (stopped) return;
    stopped = true;
    unsubStore();
    if (navDebounce != null) window.clearTimeout(navDebounce);
    window.clearInterval(pollTimer);
    window.removeEventListener("popstate", onUrlChange);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("beforeunload", onPageHide);
    history.pushState = origPush;
    history.replaceState = origReplace;
    if (currentId && extensionAlive()) {
      const bubbles = useStore.getState().bubbles;
      if (!(blockEmptyPersist && bubbles.length === 0)) {
        void persister.flush(bubbles, currentId);
      }
    }
  };

  return stopPersistence;
}

async function reanchorAll(
  saved: PersistedBubble[],
  stillCurrent: () => boolean
): Promise<ReturnType<typeof bubbleFromPersisted>[] | null> {
  const out = [];
  for (let i = 0; i < saved.length; i++) {
    if (!stillCurrent()) return null;
    const p = saved[i];
    const range = findExcerptRange(p.excerpt, p.messageIndex);
    if (range) {
      setHighlight(p.id, range, false);
      out.push(bubbleFromPersisted(p, range));
    }
    // Yield so ChatGPT's React can paint between scans.
    if (i < saved.length - 1) await sleep(0);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}
