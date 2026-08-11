import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { Gutter } from "@/gutter/Gutter";
import { Layout } from "./layout";
import { SelectionWatcher } from "./selection";
import { isHighlightApiSupported, getRange } from "./highlight";
import { startPersistence } from "./persistence";
import { useStore } from "@/state/store";
import { GUTTER_ROOT_ID, STORAGE_KEYS } from "@/config";
import { migrateLegacy } from "@/state/migrate";
import * as api from "@/api/client";
import { getHost } from "@/hosts/resolve";
import { refreshChatgptModels } from "@/hosts/chatgpt";
import { refreshGeminiModels } from "@/hosts/gemini";
import { extensionAlive, onStorageChanged, syncGet } from "@/util/chrome";
import "@/styles/gutter.css";

async function refreshHostModels(): Promise<void> {
  const host = getHost();
  if (host.id === "chatgpt") {
    await refreshChatgptModels();
  } else if (host.id === "gemini") {
    await refreshGeminiModels();
  }
  useStore.getState().setAvailableModels(host.models, host.defaultModel);
}

function boot(): void {
  // The CSS Custom Highlight API is a hard requirement (PRD 6.2). Without it we
  // cannot paint highlights without mutating React-owned DOM, so we bail loudly
  // rather than degrade into a broken experience.
  if (!isHighlightApiSupported()) {
    console.warn("[Offthread] CSS Custom Highlight API unavailable (needs Chrome 105+). Disabled.");
    return;
  }

  const layout = new Layout();
  layout.start();

  const root = document.createElement("div");
  root.id = GUTTER_ROOT_ID;
  document.body.appendChild(root);
  createRoot(root).render(
    <StrictMode>
      <Gutter layout={layout} />
    </StrictMode>
  );

  const watcher = new SelectionWatcher((capture) => {
    useStore.getState().createBubble({
      excerpt: capture.excerpt,
      context: capture.context,
      range: capture.range,
      rect: capture.rect
    });
  });
  watcher.start();

  wireHighlightClicks();
  loadPreferences();
  startPersistence();
  exposeDevApi();
  void useStore.getState().refreshUsage();
  void refreshHostModels();
}

/**
 * Dev hook: window.__offthread (and __tangent alias for old snippets).
 */
function exposeDevApi(): void {
  const hook = {
    createThread: api.createThread,
    sendMessage: api.sendMessage,
    streamReply: api.streamReply,
    archiveThread: api.archiveThread,
    getUsage: api.getUsage,
    host: getHost().id
  };
  const w = window as unknown as { __offthread?: unknown; __tangent?: unknown };
  w.__offthread = hook;
  w.__tangent = hook;
}

/** Clicking a painted highlight focuses its bubble. (PRD 7) */
function wireHighlightClicks(): void {
  document.addEventListener(
    "click",
    (e) => {
      const { bubbles, activeId, setActive } = useStore.getState();
      if (bubbles.length === 0) return;
      const x = e.clientX;
      const y = e.clientY;
      for (const b of bubbles) {
        const range = getRange(b.id);
        if (!range) continue;
        for (const rect of Array.from(range.getClientRects())) {
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            if (activeId !== b.id) setActive(b.id);
            return;
          }
        }
      }
    },
    true
  );
}

function loadPreferences(): void {
  void (async () => {
    try {
      if (!extensionAlive()) {
        useStore.getState().setDefaultModel(getHost().defaultModel);
        return;
      }
      await migrateLegacy();
      const res = await syncGet<Record<string, unknown>>([
        STORAGE_KEYS.defaultModel,
        STORAGE_KEYS.archiveOnClose
      ]);
      if (!extensionAlive()) return;
      const model = res?.[STORAGE_KEYS.defaultModel];
      const host = getHost();
      const preferred = typeof model === "string" ? model : host.defaultModel;
      const available = useStore.getState().availableModels;
      const next =
        available.some((m) => m.id === preferred) ? preferred : host.defaultModel;
      useStore.getState().setDefaultModel(next);
      useStore.getState().setArchiveOnClose(Boolean(res?.[STORAGE_KEYS.archiveOnClose]));

      // Keep the running content script in sync when options change.
      onStorageChanged((changes, area) => {
        if (area !== "sync") return;
        const modelChange = changes[STORAGE_KEYS.defaultModel];
        if (modelChange && typeof modelChange.newValue === "string") {
          useStore.getState().setDefaultModel(modelChange.newValue);
        }
        const archive = changes[STORAGE_KEYS.archiveOnClose];
        if (archive) useStore.getState().setArchiveOnClose(Boolean(archive.newValue));
      });
    } catch {
      useStore.getState().setDefaultModel(getHost().defaultModel);
    }
  })();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
