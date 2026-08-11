/**
 * Every layout / behavior constant lives here so a host-app CSS change or a
 * tuning decision is a single edit, never a hunt through the codebase.
 */

/** Width of the reserved right-hand gutter, in px. */
export const GUTTER_WIDTH = 340;

/** Gap between the gutter edge and the conversation column, in px. */
export const GUTTER_GAP = 16;

/**
 * Below this viewport width the gutter collapses and bubbles open as a
 * popover anchored to the selection instead. (PRD 6.1)
 */
export const NARROW_VIEWPORT_THRESHOLD = 1100;

/** Vertical gap enforced between stacked bubbles, in px. (PRD 6.3) */
export const BUBBLE_STACK_GAP = 12;

/** Minimum characters before we bother offering a tangent. */
export const MIN_SELECTION_LENGTH = 2;

/** Auto-title format: "Offthread: <first N chars of excerpt>". */
export const TITLE_EXCERPT_CHARS = 40;

/**
 * Selector for the claude.ai conversation column that we shift left to make
 * room for the gutter. Reverse-engineered from the DOM; kept here so a host
 * change is one edit. If not found, we degrade to popover mode. (PRD 9)
 */
export const CONVERSATION_COLUMN_SELECTORS = [
  "main .standard-markdown",
  "main [class*='max-w']",
  "main .mx-auto",
  "div.flex.flex-col.gap-3.px-4",
  "main .flex-1",
  "main"
];

/** DOM id of the root element the gutter React tree mounts into. */
export const GUTTER_ROOT_ID = "offthread-gutter-root";

/** Prefix for CSS Custom Highlight registrations. */
export const HIGHLIGHT_PREFIX = "offthread";

/**
 * System instruction for every tangent thread. (PRD 5, revised)
 *
 * The excerpt often contains danglers ("it", "this approach") that only resolve
 * against nearby text, so we now pass the containing paragraph as <context>.
 * The instruction tells the model to use that context ONLY to resolve what the
 * excerpt refers to — not to answer about it — and to fall back to asking a
 * single clarifying question if the excerpt is still ambiguous.
 */
export const SYSTEM_INSTRUCTION = `You are answering a margin note about a highlighted excerpt from a longer conversation. You receive the excerpt and, when available, the surrounding context it was taken from.

Use the context only to understand what the excerpt refers to — do not answer about the context itself and do not summarize it. Answer the question about the excerpt concisely and directly, drawing on general knowledge freely.

If the excerpt is still ambiguous even with the context, say so in one line and name the specific thing you need clarified rather than guessing.

Keep answers short — a few sentences at most. This is a margin note, not a discussion.`;

/** Max characters of surrounding context sent with a tangent. */
export const CONTEXT_MAX_CHARS = 1200;

/** When windowing a long block, chars kept on each side of the excerpt. */
export const CONTEXT_WINDOW_CHARS = 500;

/** Storage keys for chrome.storage.sync (options) and local (persistence). */
export const STORAGE_KEYS = {
  defaultModel: "offthread.defaultModel",
  archiveOnClose: "offthread.archiveOnClose",
  dontAskArchive: "offthread.dontAskArchive",
  /** Map of conversationId → persisted bubbles (chrome.storage.local). */
  persist: "offthread.persist.v1"
} as const;

/**
 * Chosen LLM API provider for Offthread bubbles on ChatGPT / Gemini pages.
 * One provider + one key — usable on either host page.
 */
export const API_PROVIDER_STORAGE = "offthread.apiProvider";

/** Single API key for the selected provider (chrome.storage.local). */
export const API_KEY_STORAGE = "offthread.apiKey";

/** Older dual-key slots — migrated once into API_KEY_STORAGE. */
export const OPENAI_API_KEY_STORAGE = "offthread.openaiApiKey";
export const GEMINI_API_KEY_STORAGE = "offthread.geminiApiKey";

/** Pre-2.0 keys — migrated once on first read. */
export const LEGACY_STORAGE_KEYS = {
  defaultModel: "tangent.defaultModel",
  archiveOnClose: "tangent.archiveOnClose",
  dontAskArchive: "tangent.dontAskArchive",
  persist: "tangent.persist.v1"
} as const;

/** Debounce for writing bubbles to storage after store changes. */
export const PERSIST_DEBOUNCE_MS = 300;
