import type { HostAdapter } from "../types";
import { applyProviderModels, providerApi } from "../provider";
import {
  CHATGPT_API_DEFAULT_MODEL,
  CHATGPT_API_MODELS
} from "./models";

export const CHATGPT_MODELS = CHATGPT_API_MODELS;

export const chatgptHost: HostAdapter = {
  id: "chatgpt",
  label: "ChatGPT",
  matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  models: [...CHATGPT_API_MODELS],
  defaultModel: CHATGPT_API_DEFAULT_MODEL,
  // Keep this narrow — bare `article` matched the whole app and made restore
  // walk enormous DOM trees (felt like ChatGPT was stuck loading).
  messageBlockSelector: "main [data-message-author-role]",
  columnSelectors: [
    "main [data-message-author-role]",
    "main .text-base",
    "main"
  ],
  selection: {
    // ChatGPT's selection action popover ("Ask ChatGPT" | "Start writing").
    tooltipSelector: '[popover][aria-live="polite"], [popover="manual"]',
    replyButtonPattern: /Start writing|Ask ChatGPT/i
  },
  selectableRootSelector: "main",
  getConversationId(href = location.href) {
    try {
      const url = new URL(href);
      const match = url.pathname.match(/\/c\/([0-9a-f-]{36})/i);
      return match?.[1] ?? url.pathname.match(/\/c\/([a-z0-9-]+)/i)?.[1] ?? null;
    } catch {
      return null;
    }
  },
  persistKey(conversationId) {
    return `chatgpt:${conversationId}`;
  },
  api: providerApi
};

/** Apply the user's selected API provider models onto this host. */
export async function refreshChatgptModels(): Promise<void> {
  await applyProviderModels(chatgptHost);
}
