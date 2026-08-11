import { ApiError, type ThreadId, type Usage } from "@/api/types";
import { isTerminal, parseSse } from "@/api/sse";
import type { HostApi, SendOptions } from "../types";
import { CHATGPT_DEFAULT_MODEL } from "./models";
import { fetchSentinelHeaders, ChallengeRequiredError } from "./sentinel";

const DEFAULT_MODEL = CHATGPT_DEFAULT_MODEL;

let cachedToken: string | null = null;
/** Local bubble thread id → ChatGPT conversation id (set after first SSE). */
const conversationByThread = new Map<string, string>();
/** Local bubble thread id → last assistant/user message id for parent chain. */
const parentByThread = new Map<string, string>();
/** Thread id of the in-flight sendMessage → streamReply pair. */
let activeStreamThread: string | null = null;

async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  let res: Response;
  try {
    res = await fetch("/api/auth/session", { credentials: "include" });
  } catch (e) {
    throw new ApiError("network", `Network request failed: ${String(e)}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ApiError("auth", "Session expired. Reload ChatGPT to re-authenticate.", res.status);
  }
  if (!res.ok) {
    throw new ApiError("unknown", `Could not read ChatGPT session (${res.status}).`, res.status);
  }
  const json = (await res.json()) as { accessToken?: string };
  if (!json.accessToken) {
    throw new ApiError("auth", "Sign in to ChatGPT to use Offthread.");
  }
  cachedToken = json.accessToken;
  return cachedToken;
}

function timezoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function buildConversationBody(
  threadId: string,
  content: string,
  model: string
): Record<string, unknown> {
  const parent = parentByThread.get(threadId) ?? crypto.randomUUID();
  const messageId = crypto.randomUUID();
  // Optimistic parent for the next turn; SSE may overwrite with server ids.
  parentByThread.set(threadId, messageId);

  const body: Record<string, unknown> = {
    action: "next",
    messages: [
      {
        id: messageId,
        author: { role: "user" },
        content: { content_type: "text", parts: [content] },
        metadata: {}
      }
    ],
    parent_message_id: parent,
    model,
    timezone_offset_min: new Date().getTimezoneOffset(),
    timezone: timezoneName(),
    history_and_training_disabled: false,
    conversation_mode: { kind: "primary_assistant" },
    force_paragen: false,
    force_rate_limit: false,
    system_hints: [],
    supports_buffering: true
  };

  const existing = conversationByThread.get(threadId);
  if (existing) body.conversation_id = existing;

  return body;
}

function errorFromBody(status: number, text: string): ApiError {
  let detail = text.slice(0, 280);
  try {
    const parsed = JSON.parse(text) as { detail?: string; message?: string; error?: { message?: string } };
    detail = parsed.detail || parsed.message || parsed.error?.message || detail;
  } catch {
    /* keep raw */
  }
  if (/unusual activity/i.test(detail)) {
    return new ApiError(
      "unknown",
      "ChatGPT blocked this request (unusual activity). Wait a bit, then retry — Offthread must pass ChatGPT's sentinel check.",
      status,
      detail
    );
  }
  if (status === 429) {
    return new ApiError("rate_limit", "ChatGPT rate limit reached.", 429, detail);
  }
  return new ApiError("unknown", detail || `ChatGPT returned ${status}.`, status, detail);
}

export const chatgptApi: HostApi = {
  async createThread() {
    // ChatGPT assigns the real conversation id on the first SSE response.
    const id = crypto.randomUUID() as ThreadId;
    parentByThread.set(id, crypto.randomUUID());
    return id;
  },

  async sendMessage(threadId, content, opts: SendOptions = {}) {
    const token = await getToken();
    let sentinel;
    try {
      sentinel = await fetchSentinelHeaders(token);
    } catch (e) {
      if (e instanceof ChallengeRequiredError) {
        throw new ApiError(
          "auth",
          "ChatGPT is enforcing a bot check (Turnstile) on your account that Offthread can't pass. ChatGPT support for margin notes is unavailable right now — use Claude, or switch ChatGPT to an API key.",
          undefined,
          e.kinds.join(", ")
        );
      }
      throw new ApiError(
        "unknown",
        e instanceof Error ? e.message : "Could not prepare ChatGPT sentinel tokens."
      );
    }

    const body = buildConversationBody(threadId, content, opts.model ?? DEFAULT_MODEL);
    activeStreamThread = threadId;

    let res: Response;
    try {
      res = await fetch("/backend-api/conversation", {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...sentinel
        },
        body: JSON.stringify(body),
        signal: opts.signal
      });
    } catch (e) {
      throw new ApiError("network", `Network request failed: ${String(e)}`);
    }
    if (res.status === 401) {
      cachedToken = null;
      throw new ApiError("auth", "Session expired. Reload ChatGPT to re-authenticate.", 401);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw errorFromBody(res.status, text);
    }
    if (!res.body) throw new ApiError("parse", "ChatGPT response had no body to stream.");
    return res;
  },

  async streamReply(response, onDelta, signal) {
    if (!response.body) throw new ApiError("parse", "Response has no body.");
    const threadKey = activeStreamThread;
    let full = "";
    try {
      for await (const frame of parseSse(response.body, signal)) {
        const meta = readStreamMeta(frame.data);
        if (threadKey && meta.conversationId) {
          conversationByThread.set(threadKey, meta.conversationId);
        }
        if (threadKey && meta.messageId) {
          parentByThread.set(threadKey, meta.messageId);
        }

        const next = meta.text || readFullMessage(frame.data);
        if (next && next.length > full.length) {
          const delta = next.slice(full.length);
          full = next;
          onDelta(delta);
        }
        if (isTerminal(frame) || frame.data === "[DONE]") break;
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError("network", `Stream interrupted: ${String(e)}`);
    } finally {
      activeStreamThread = null;
    }
    return full;
  },

  async archiveThread(threadId) {
    const conversationId = conversationByThread.get(threadId) ?? threadId;
    try {
      const token = await getToken();
      await fetch(`/backend-api/conversation/${conversationId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ is_visible: false })
      });
    } catch {
      /* best-effort */
    }
  },

  async getUsage(): Promise<Usage> {
    return { percent: null };
  }
};

function readFullMessage(raw: string): string {
  if (!raw || raw === "[DONE]") return "";
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const message = obj.message as Record<string, unknown> | undefined;
    const content = message?.content as Record<string, unknown> | undefined;
    const parts = content?.parts;
    if (Array.isArray(parts) && typeof parts[0] === "string") return parts[0];
  } catch {
    /* ignore */
  }
  return "";
}

function readStreamMeta(raw: string): {
  text: string;
  conversationId?: string;
  messageId?: string;
} {
  if (!raw || raw === "[DONE]") return { text: "" };
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const conversationId =
      typeof obj.conversation_id === "string" ? obj.conversation_id : undefined;
    const message = obj.message as Record<string, unknown> | undefined;
    const messageId = typeof message?.id === "string" ? message.id : undefined;
    const content = message?.content as Record<string, unknown> | undefined;
    const parts = content?.parts;
    const text = Array.isArray(parts) && typeof parts[0] === "string" ? parts[0] : "";
    return { text, conversationId, messageId };
  } catch {
    return { text: "" };
  }
}
