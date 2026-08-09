import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { Gutter } from "@/gutter/Gutter";
import { Layout } from "./layout";
import { SelectionWatcher } from "./selection";
import { isHighlightApiSupported, getRange } from "./highlight";
import { startPersistence } from "./persistence";
import { useStore } from "@/state/store";
import { GUTTER_ROOT_ID, STORAGE_KEYS } from "@/config";
import { DEFAULT_MODEL_ID } from "@/api/types";
import * as api from "@/api/client";
import "@/styles/gutter.css";

function boot(): void {
  // The CSS Custom Highlight API is a hard requirement (PRD 6.2). Without it we
  // cannot paint highlights without mutating React-owned DOM, so we bail loudly
  // rather than degrade into a broken experience.
  if (!isHighlightApiSupported()) {
    console.warn("[Tangent] CSS Custom Highlight API unavailable (needs Chrome 105+). Disabled.");
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
}

/**
 * Expose the isolated network layer on window.__tangent so it can be exercised
 * from the devtools console against a scratch thread, independent of the UI.
 * (PRD M2) This is the only sanctioned way to poke the network directly.
 */
function exposeDevApi(): void {
  (window as unknown as { __tangent?: unknown }).__tangent = {
    getOrgId: api.getOrgId,
    createThread: api.createThread,
    sendMessage: api.sendMessage,
    streamReply: api.streamReply,
    archiveThread: api.archiveThread,
    getUsage: api.getUsage
  };
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
  try {
    chrome.storage?.sync.get(
      [STORAGE_KEYS.defaultModel, STORAGE_KEYS.archiveOnClose],
      (res) => {
        const model = res?.[STORAGE_KEYS.defaultModel];
        useStore.getState().setDefaultModel(typeof model === "string" ? model : DEFAULT_MODEL_ID);
        useStore.getState().setArchiveOnClose(Boolean(res?.[STORAGE_KEYS.archiveOnClose]));
      }
    );
    // Keep the running content script in sync when options change.
    chrome.storage?.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      const model = changes[STORAGE_KEYS.defaultModel];
      if (model && typeof model.newValue === "string") {
        useStore.getState().setDefaultModel(model.newValue);
      }
      const archive = changes[STORAGE_KEYS.archiveOnClose];
      if (archive) useStore.getState().setArchiveOnClose(Boolean(archive.newValue));
    });
  } catch {
    useStore.getState().setDefaultModel(DEFAULT_MODEL_ID);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
