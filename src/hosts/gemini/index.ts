import type { HostAdapter } from "../types";
import { applyProviderModels, providerApi } from "../provider";
import { GEMINI_DEFAULT_MODEL, GEMINI_MODELS } from "./models";

export { GEMINI_MODELS, GEMINI_DEFAULT_MODEL } from "./models";

export const geminiHost: HostAdapter = {
  id: "gemini",
  label: "Gemini",
  matches: ["https://gemini.google.com/*"],
  models: [...GEMINI_MODELS],
  defaultModel: GEMINI_DEFAULT_MODEL,
  messageBlockSelector: "message-content, .model-response-text, [data-message-id]",
  columnSelectors: [
    "main message-content",
    "main .conversation-container",
    "chat-window",
    "main"
  ],
  selection: {
    tooltipSelector: "",
    replyButtonPattern: /^$/
  },
  selectableRootSelector: "main, chat-window, body",
  getConversationId(href = location.href) {
    try {
      const url = new URL(href);
      return (
        url.searchParams.get("q") ??
        url.pathname.match(/\/app\/([a-zA-Z0-9_-]+)/)?.[1] ??
        url.hash.replace(/^#/, "") ??
        null
      );
    } catch {
      return null;
    }
  },
  persistKey(conversationId) {
    return `gemini:${conversationId}`;
  },
  api: providerApi
};

/** Apply the user's selected API provider models onto this host. */
export async function refreshGeminiModels(): Promise<void> {
  await applyProviderModels(geminiHost);
}
