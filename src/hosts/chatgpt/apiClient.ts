/**
 * ChatGPT via the official OpenAI API (api.openai.com) using the user's key.
 * Stateless: we keep per-thread message history in-memory and resend it each
 * turn. This is the reliable path since ChatGPT's web session is Turnstile-gated.
 */
import { ApiError, type ThreadId, type Usage } from "@/api/types";
import type { HostApi, SendOptions } from "../types";
import { CHATGPT_API_MODEL_ID } from "./models";

const API_BASE = "https://api.openai.com/v1";

interface ApiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const historyByThread = new Map<string, ApiMessage[]>();
let activeStreamThread: string | null = null;

function keyOrThrow(key: string | null): string {
  if (!key) {
    throw new ApiError("auth", "Add your OpenAI API key in Offthread's options to use ChatGPT.");
  }
  return key;
}

export function createChatgptApiClient(getKey: () => string | null): HostApi {
  return {
    async createThread() {
      const id = crypto.randomUUID() as ThreadId;
      historyByThread.set(id, []);
      return id;
    },

    async sendMessage(threadId, content, opts: SendOptions = {}) {
      const key = keyOrThrow(getKey());
      const history = historyByThread.get(threadId) ?? [];
      if (opts.system && !history.some((m) => m.role === "system")) {
        history.unshift({ role: "system", content: opts.system });
      }
      history.push({ role: "user", content });
      historyByThread.set(threadId, history);
      activeStreamThread = threadId;

      let res: Response;
      try {
        res = await fetch(`${API_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            // Always gpt-4o — bubble UI label is GPT-Offthread; ignore picker ids.
            model: CHATGPT_API_MODEL_ID,
            messages: history,
            stream: true
          }),
          signal: opts.signal
        });
      } catch (e) {
        throw new ApiError("network", `Network request failed: ${String(e)}`);
      }

      if (!res.ok) {
        throw errorFromResponse(res.status, await res.text().catch(() => ""));
      }
      if (!res.body) throw new ApiError("parse", "OpenAI response had no body to stream.");
      return res;
    },

    async streamReply(response, onDelta, signal) {
      if (!response.body) throw new ApiError("parse", "Response has no body.");
      const threadKey = activeStreamThread;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      const onAbort = () => reader.cancel().catch(() => {});
      signal?.addEventListener("abort", onAbort);

      try {
        while (true) {
          if (signal?.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            for (const line of frame.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (data === "[DONE]") continue;
              const delta = extractContent(data);
              if (delta) {
                full += delta;
                onDelta(delta);
              }
            }
          }
        }
      } catch (e) {
        throw new ApiError("network", `Stream interrupted: ${String(e)}`);
      } finally {
        signal?.removeEventListener("abort", onAbort);
        reader.releaseLock();
        if (threadKey && full) {
          const history = historyByThread.get(threadKey) ?? [];
          history.push({ role: "assistant", content: full });
          historyByThread.set(threadKey, history);
        }
        activeStreamThread = null;
      }
      return full;
    },

    async archiveThread(threadId) {
      historyByThread.delete(threadId);
    },

    async getUsage(): Promise<Usage> {
      return { percent: null };
    }
  };
}

function extractContent(data: string): string {
  try {
    const obj = JSON.parse(data) as {
      choices?: { delta?: { content?: string } }[];
    };
    const piece = obj.choices?.[0]?.delta?.content;
    return typeof piece === "string" ? piece : "";
  } catch {
    return "";
  }
}

function errorFromResponse(status: number, text: string): ApiError {
  let message = text.slice(0, 200);
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string; code?: string } };
    message = parsed.error?.message || message;
  } catch {
    /* keep raw */
  }
  if (status === 401) {
    return new ApiError("auth", "Invalid OpenAI API key. Update it in Offthread's options.", 401);
  }
  if (status === 429) {
    return new ApiError("rate_limit", message || "OpenAI rate limit or quota reached.", 429);
  }
  if (status === 404) {
    return new ApiError("model", message || "That model isn't available on your OpenAI key.", 404);
  }
  return new ApiError("unknown", message || `OpenAI API returned ${status}.`, status);
}
