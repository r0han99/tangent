/**
 * Server-sent-event parsing. (PRD 6.4)
 *
 * claude.ai's completion endpoint streams SSE, not a single JSON body. This
 * module turns a ReadableStream into parsed event frames. Built properly on
 * day one so streaming is never retrofitted.
 *
 * SSE frame grammar (simplified): frames are separated by a blank line; within
 * a frame, lines are `field: value`. We care about `event:` and `data:`.
 */

export interface SseFrame {
  event: string | null;
  data: string;
}

/** Async-iterate parsed SSE frames from a fetch Response body. */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const onAbort = () => reader.cancel().catch(() => {});
  signal?.addEventListener("abort", onAbort);

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Frames are delimited by a blank line. Normalize CRLF first.
      buffer = buffer.replace(/\r\n/g, "\n");
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawFrame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const frame = parseFrame(rawFrame);
        if (frame) yield frame;
      }
    }
    // Flush a trailing frame without terminating blank line.
    const tail = parseFrame(buffer);
    if (tail) yield tail;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

function parseFrame(raw: string): SseFrame | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let event: string | null = null;
  const dataLines: string[] = [];

  for (const line of trimmed.split("\n")) {
    if (line.startsWith(":")) continue; // comment/heartbeat
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    // Per spec a single leading space after the colon is stripped.
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }

  if (dataLines.length === 0 && event === null) return null;
  return { event, data: dataLines.join("\n") };
}

/**
 * Extract an incremental text delta from a parsed SSE data payload.
 *
 * claude.ai has used more than one streaming shape over time; we defensively
 * probe the known ones rather than assume a single schema (PRD 6.4):
 *   - `{ "completion": " partial text" }`             (legacy)
 *   - `{ "delta": { "text": "..." } }`                (content_block_delta)
 *   - `{ "content_block": { "text": "..." } }`        (block start)
 * Returns "" when the frame carries no user-visible text (ping, stop, etc.).
 */
export function extractDelta(data: string): string {
  if (!data || data === "[DONE]") return "";
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return "";
  }
  if (typeof json !== "object" || json === null) return "";

  const obj = json as Record<string, unknown>;

  if (typeof obj.completion === "string") return obj.completion;

  const delta = obj.delta as Record<string, unknown> | undefined;
  if (delta && typeof delta.text === "string") return delta.text;

  const block = obj.content_block as Record<string, unknown> | undefined;
  if (block && typeof block.text === "string") return block.text;

  return "";
}

/** True when the frame signals end-of-stream. */
export function isTerminal(frame: SseFrame): boolean {
  if (frame.data === "[DONE]") return true;
  if (frame.event === "message_stop" || frame.event === "completion_stop") return true;
  try {
    const obj = JSON.parse(frame.data) as Record<string, unknown>;
    if (obj.type === "message_stop") return true;
    if (obj.stop_reason != null) return true;
  } catch {
    /* not json */
  }
  return false;
}
