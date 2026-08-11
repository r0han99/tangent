import type { HostAdapter } from "../types";
import * as api from "./api";

export const CLAUDE_MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (fast, default)" },
  { id: "claude-sonnet-4-5", label: "Sonnet 4.5" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-opus-4-7", label: "Opus 4.7" }
];

export const claudeHost: HostAdapter = {
  id: "claude",
  label: "Claude",
  matches: ["https://claude.ai/*"],
  models: CLAUDE_MODELS,
  defaultModel: CLAUDE_MODELS[0].id,
  messageBlockSelector: ".standard-markdown",
  columnSelectors: [
    "main .standard-markdown",
    "main [class*='max-w']",
    "main .mx-auto",
    "div.flex.flex-col.gap-3.px-4",
    "main .flex-1",
    "main"
  ],
  selection: {
    tooltipSelector: "[data-selection-tooltip='true']",
    replyButtonPattern: /^Reply\b/i
  },
  selectableRootSelector: "main",
  getConversationId(href = location.href) {
    try {
      const url = new URL(href);
      const match = url.pathname.match(/\/chat\/([0-9a-f-]{36})/i);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  },
  persistKey(conversationId) {
    return `claude:${conversationId}`;
  },
  api
};
