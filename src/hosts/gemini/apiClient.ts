/**
 * Gemini via the official Generative Language API using the user's key.
 * Stateless: per-thread history is kept in-memory and resent each turn.
 * gemini.google.com's web StreamGenerate path is unstable from an extension.
 */
import { ApiError, type ThreadId, type Usage } from "@/api/types";
import type { HostApi, SendOptions } from "../types";
import { GEMINI_API_MODEL_ID } from "./models";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface ApiPart {
  text: string;
}

interface ApiContent {
  role: "user" | "model";
  parts: ApiPart[];
}

interface ThreadState {
  system?: string;
  contents: ApiContent[];
}

const historyByThread = new Map<string, ThreadState>();
let activeStreamThread: string | null = null;

function keyOrThrow(key: string | null): string {
  if (!key) {
    throw new ApiError(
      "auth",
      "Add your API key in Offthread Options (ChatGPT & Gemini require a key)."
    );
  }
  return key;
}

export function createGeminiApiClient(getKey: () => string | null): HostApi {
  return {
    async createThread() {
      const id = crypto.randomUUID() as ThreadId;
      historyByThread.set(id, { contents: [] });
      return id;
    },

    async sendMessage(threadId, content, opts: SendOptions = {}) {
      const key = keyOrThrow(getKey());
      const state = historyByThread.get(threadId) ?? { contents: [] };
      if (opts.system && !state.system) state.system = opts.system;
      state.contents.push({ role: "user", parts: [{ text: content }] });
      historyByThread.set(threadId, state);
      activeStreamThread = threadId;

      // Always gemini-2.5-flash — UI label is Gemini-Offthread; ignore stale bubble ids.
      const model = GEMINI_API_MODEL_ID;
      const body: Record<string, unknown> = {
        contents: state.contents
      };
      if (state.system) {
        body.system_instruction = { parts: [{ text: state.system }] };
      }

      let res: Response;
      try {
        res = await fetch(
          `${API_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": key
            },
            body: JSON.stringify(body),
            signal: opts.signal
          }
        );
      } catch (e) {
        throw new ApiError("network", `Network request failed: ${String(e)}`);
      }

      if (!res.ok) {
        throw errorFromResponse(res.status, await res.text().catch(() => ""));
      }
      if (!res.body) throw new ApiError("parse", "Gemini response had no body to stream.");
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
              if (!data || data === "[DONE]") continue;
              const delta = extractText(data);
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
          const state = historyByThread.get(threadKey) ?? { contents: [] };
          state.contents.push({ role: "model", parts: [{ text: full }] });
          historyByThread.set(threadKey, state);
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

function extractText(data: string): string {
  try {
    const obj = JSON.parse(data) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const parts = obj.candidates?.[0]?.content?.parts;
    if (!parts?.length) return "";
    return parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
  } catch {
    return "";
  }
}

function errorFromResponse(status: number, text: string): ApiError {
  let message = text.slice(0, 240);
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string; status?: string } };
    message = parsed.error?.message || message;
  } catch {
    /* keep raw */
  }
  if (status === 400 && /not found|is not found/i.test(message)) {
    return new ApiError("model", message || "That Gemini model isn't available on your key.", 400);
  }
  if (status === 401 || status === 403) {
    return new ApiError(
      "auth",
      message || "Invalid Gemini API key. Update it in Offthread's options.",
      status
    );
  }
  if (status === 429) {
    return new ApiError("rate_limit", message || "Gemini rate limit or quota reached.", 429);
  }
  return new ApiError("unknown", message || `Gemini API returned ${status}.`, status);
}
