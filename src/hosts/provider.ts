/**
 * Shared LLM provider for ChatGPT + Gemini host pages.
 * The user picks one API (OpenAI or Gemini) and one key; Offthread uses that
 * backend on either site. Claude keeps its session-based path.
 */
import { ApiError, type ModelOption } from "@/api/types";
import {
  API_KEY_STORAGE,
  API_PROVIDER_STORAGE,
  GEMINI_API_KEY_STORAGE,
  OPENAI_API_KEY_STORAGE
} from "@/config";
import type { HostApi } from "./types";
import { createChatgptApiClient } from "./chatgpt/apiClient";
import { CHATGPT_API_MODELS, CHATGPT_API_DEFAULT_MODEL } from "./chatgpt/models";
import { createGeminiApiClient } from "./gemini/apiClient";
import { GEMINI_DEFAULT_MODEL, GEMINI_MODELS } from "./gemini/models";
import { extensionAlive, localGet, localSet, onStorageChanged } from "@/util/chrome";

export type ApiProviderId = "openai" | "gemini";

export interface ProviderPrefs {
  provider: ApiProviderId;
  apiKey: string | null;
}

export const PROVIDER_OPTIONS: {
  id: ApiProviderId;
  label: string;
  placeholder: string;
  docsUrl: string;
  docsLabel: string;
}[] = [
  {
    id: "openai",
    label: "OpenAI",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
    docsLabel: "platform.openai.com/api-keys"
  },
  {
    id: "gemini",
    label: "Gemini",
    placeholder: "AIza...",
    docsUrl: "https://aistudio.google.com/apikey",
    docsLabel: "aistudio.google.com/apikey"
  }
];

/** Greyed "coming soon" chips in Options — not selectable yet. */
export const COMING_SOON_PROVIDERS = ["Anthropic", "Mistral", "Grok"] as const;

let prefs: ProviderPrefs = { provider: "openai", apiKey: null };
let loaded = false;
let unwatch: (() => void) | null = null;

const openaiClient = createChatgptApiClient(() =>
  prefs.provider === "openai" ? prefs.apiKey : null
);
const geminiClient = createGeminiApiClient(() =>
  prefs.provider === "gemini" ? prefs.apiKey : null
);

function activeClient(): HostApi {
  return prefs.provider === "gemini" ? geminiClient : openaiClient;
}

export function getProviderModels(): { models: ModelOption[]; defaultModel: string } {
  if (prefs.provider === "gemini") {
    return { models: [...GEMINI_MODELS], defaultModel: GEMINI_DEFAULT_MODEL };
  }
  return { models: [...CHATGPT_API_MODELS], defaultModel: CHATGPT_API_DEFAULT_MODEL };
}

/** HostApi that routes to the user's selected provider on any host page. */
export const providerApi: HostApi = {
  async createThread(...args) {
    await ensureProviderReady();
    return activeClient().createThread(...args);
  },
  async sendMessage(...args) {
    await ensureProviderReady();
    return activeClient().sendMessage(...args);
  },
  async streamReply(...args) {
    return activeClient().streamReply(...args);
  },
  async archiveThread(...args) {
    return activeClient().archiveThread(...args);
  },
  async getUsage(...args) {
    return activeClient().getUsage(...args);
  }
};

export async function loadProviderPrefs(): Promise<ProviderPrefs> {
  if (loaded) return prefs;
  if (!extensionAlive()) {
    loaded = true;
    return prefs;
  }

  await migrateLegacyKeys();

  const res = await localGet<Record<string, string>>([API_PROVIDER_STORAGE, API_KEY_STORAGE]);
  const provider =
    res?.[API_PROVIDER_STORAGE] === "gemini" || res?.[API_PROVIDER_STORAGE] === "openai"
      ? (res[API_PROVIDER_STORAGE] as ApiProviderId)
      : "openai";
  const key = res?.[API_KEY_STORAGE];
  prefs = {
    provider,
    apiKey: typeof key === "string" && key.trim() ? key.trim() : null
  };
  loaded = true;
  startWatch();
  return prefs;
}

function startWatch(): void {
  if (unwatch || !extensionAlive()) return;
  unwatch = onStorageChanged((changes, area) => {
    if (area !== "local") return;
    if (changes[API_PROVIDER_STORAGE]) {
      const v = changes[API_PROVIDER_STORAGE].newValue;
      if (v === "openai" || v === "gemini") prefs.provider = v;
    }
    if (changes[API_KEY_STORAGE]) {
      const v = changes[API_KEY_STORAGE].newValue;
      prefs.apiKey = typeof v === "string" && v.trim() ? v.trim() : null;
    }
    loaded = true;
  });
}

async function ensureProviderReady(): Promise<void> {
  await loadProviderPrefs();
  if (!prefs.apiKey) {
    const name = prefs.provider === "gemini" ? "Gemini" : "OpenAI";
    throw new ApiError(
      "auth",
      `Add your ${name} API key in Offthread Options (ChatGPT & Gemini require a key).`
    );
  }
}

/**
 * Migrate dual vendor keys / older unified key into API_KEY_STORAGE + provider.
 */
async function migrateLegacyKeys(): Promise<void> {
  if (!extensionAlive()) return;
  const res = await localGet<Record<string, string>>([
    API_KEY_STORAGE,
    API_PROVIDER_STORAGE,
    OPENAI_API_KEY_STORAGE,
    GEMINI_API_KEY_STORAGE
  ]);

  if (typeof res?.[API_KEY_STORAGE] === "string" && res[API_KEY_STORAGE].trim()) {
    return;
  }

  const openai =
    typeof res?.[OPENAI_API_KEY_STORAGE] === "string" ? res[OPENAI_API_KEY_STORAGE].trim() : "";
  const gemini =
    typeof res?.[GEMINI_API_KEY_STORAGE] === "string" ? res[GEMINI_API_KEY_STORAGE].trim() : "";
  if (!openai && !gemini) return;

  const provider: ApiProviderId = gemini && !openai ? "gemini" : "openai";
  const apiKey = provider === "gemini" ? gemini : openai || gemini;
  await localSet({
    [API_PROVIDER_STORAGE]: provider,
    [API_KEY_STORAGE]: apiKey
  });
}

/**
 * Apply the locked Offthread model for the selected API provider.
 * ChatGPT/Gemini pages always show GPT-Offthread or Gemini-Offthread (no picker).
 */
export async function applyProviderModels(host: {
  models: ModelOption[];
  defaultModel: string;
}): Promise<void> {
  await loadProviderPrefs();
  const base = getProviderModels();
  host.models = base.models;
  host.defaultModel = base.defaultModel;
}
