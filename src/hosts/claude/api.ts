import { ApiError, type OrgId, type ThreadId, type Usage } from "@/api/types";
import { extractDelta, isTerminal, parseSse } from "@/api/sse";

const DEFAULT_MODEL_ID = "claude-haiku-4-5";

/**
 * ============================================================================
 * THE ONLY FILE IN THE CODEBASE THAT TOUCHES THE NETWORK. (PRD 6.4)
 * ============================================================================
 *
 * These endpoints are claude.ai's own internal app plumbing, NOT a public
 * contract. Request shapes, required headers, and the org identifiers in the
 * URL paths can change without notice. The value of isolating them here is
 * that a breaking change is one file to fix, not a hunt through UI code.
 *
 * Everything below was derived by observing the network tab on claude.ai and
 * should be re-verified there when it breaks — do not trust it as a spec.
 *
 * Because the content script is same-origin with claude.ai, fetch() carries
 * the session cookie automatically; there is no separate auth. (PRD 6)
 */

const API_BASE = "/api";

interface SendOptions {
  model?: string;
  /** System instruction prepended to the tangent context. (PRD 5) */
  system?: string;
  signal?: AbortSignal;
}

/** Cached org id for the session; resolved lazily on first use. */
let cachedOrgId: OrgId | null = null;

async function request(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {})
      }
    });
  } catch (e) {
    throw new ApiError("network", `Network request failed: ${String(e)}`);
  }
  if (!res.ok) throw errorForStatus(res.status, await safeText(res));
  return res;
}

function errorForStatus(status: number, body: string): ApiError {
  const parsed = parseErrorBody(body);

  // Claude returns permission_error + model_not_available as 403; that is NOT
  // an expired session. Classify from the body first.
  if (parsed.code === "model_not_available" || /model.?not.?available/i.test(parsed.message)) {
    return new ApiError(
      "model",
      parsed.message || "This model isn't available. Switch to another model.",
      status,
      parsed.message
    );
  }

  switch (status) {
    case 401:
      return new ApiError("auth", "Session expired. Reload the page to re-authenticate.", status);
    case 403:
      // Only treat as auth when the body doesn't explain a more specific failure.
      if (parsed.code || parsed.message) {
        return new ApiError("unknown", parsed.message || "Request forbidden.", status, parsed.message);
      }
      return new ApiError("auth", "Session expired. Reload the page to re-authenticate.", status);
    case 404:
      return new ApiError("not_found", "Conversation or organization not found.", status);
    case 429:
      return new ApiError("rate_limit", "Rate limit reached.", status, parsed.message || undefined);
    default:
      if (status >= 500) return new ApiError("server", `Claude returned ${status}.`, status);
      return new ApiError(
        "unknown",
        parsed.message || `Unexpected status ${status}.`,
        status,
        parsed.message || undefined
      );
  }
}

interface ParsedError {
  code: string | null;
  message: string;
}

function parseErrorBody(body: string): ParsedError {
  try {
    const obj = JSON.parse(body) as Record<string, unknown>;
    const err = (obj.error ?? obj) as Record<string, unknown>;
    const details = (err.details ?? {}) as Record<string, unknown>;
    const code =
      (typeof details.error_code === "string" && details.error_code) ||
      (typeof err.error_code === "string" && err.error_code) ||
      null;
    const message =
      (typeof details.message === "string" && details.message) ||
      (typeof err.message === "string" && err.message) ||
      (typeof obj.message === "string" && obj.message) ||
      "";
    return { code, message };
  } catch {
    return { code: null, message: body?.slice(0, 200) || "" };
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/** Resolve the active organization id from the session. */
export async function getOrgId(): Promise<OrgId> {
  if (cachedOrgId) return cachedOrgId;
  const res = await request("/organizations", { method: "GET" });
  let orgs: unknown;
  try {
    orgs = await res.json();
  } catch {
    throw new ApiError("parse", "Could not parse organizations response.");
  }
  if (!Array.isArray(orgs) || orgs.length === 0) {
    throw new ApiError("not_found", "No organizations on this session.");
  }
  // Prefer an org that has chat capability; fall back to the first.
  const chatOrg =
    orgs.find(
      (o) =>
        o &&
        typeof o === "object" &&
        Array.isArray((o as Record<string, unknown>).capabilities) &&
        ((o as Record<string, unknown>).capabilities as string[]).includes("chat")
    ) ?? orgs[0];
  const uuid = (chatOrg as Record<string, unknown>).uuid;
  if (typeof uuid !== "string") throw new ApiError("parse", "Organization missing uuid.");
  cachedOrgId = uuid as OrgId;
  return cachedOrgId;
}

/** Create a new (side) conversation and return its id. (PRD 6.4) */
export async function createThread(title: string, model?: string): Promise<ThreadId> {
  const org = await getOrgId();
  const uuid = crypto.randomUUID();
  const res = await request(`/organizations/${org}/chat_conversations`, {
    method: "POST",
    body: JSON.stringify({
      name: title,
      uuid,
      model: model ?? DEFAULT_MODEL_ID
    })
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError("parse", "Could not parse thread creation response.");
  }
  const created = (json as Record<string, unknown>)?.uuid;
  if (typeof created !== "string") throw new ApiError("parse", "Created thread missing uuid.");
  return created as ThreadId;
}

/**
 * Post a message to a thread and return the raw streaming Response. Kept
 * separate from streamReply so the SSE consumer can be tested independently.
 */
export async function sendMessage(
  threadId: ThreadId,
  content: string,
  opts: SendOptions = {}
): Promise<Response> {
  const org = await getOrgId();
  const model = opts.model ?? DEFAULT_MODEL_ID;
  const body: Record<string, unknown> = {
    prompt: content,
    model,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language || "en-US",
    rendering_mode: "messages",
    // Required by the current completion shape; fresh UUIDs per turn.
    turn_message_uuids: {
      human_message_uuid: crypto.randomUUID(),
      assistant_message_uuid: crypto.randomUUID()
    },
    attachments: [],
    files: [],
    sync_sources: []
  };
  if (opts.system) body.personalized_styles = [{ type: "custom", prompt: opts.system }];

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/organizations/${org}/chat_conversations/${threadId}/completion`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Origin: "https://claude.ai",
        Referer: "https://claude.ai/"
      },
      body: JSON.stringify(body),
      signal: opts.signal
    });
  } catch (e) {
    throw new ApiError("network", `Network request failed: ${String(e)}`);
  }
  if (!res.ok) throw errorForStatus(res.status, await safeText(res));
  if (!res.body) throw new ApiError("parse", "Completion response had no body to stream.");
  return res;
}

/**
 * Consume a streaming completion Response, invoking onDelta for each text
 * chunk. Resolves with the full concatenated reply. (PRD 6.4)
 */
export async function streamReply(
  response: Response,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  if (!response.body) throw new ApiError("parse", "Response has no body.");
  let full = "";
  try {
    for await (const frame of parseSse(response.body, signal)) {
      const delta = extractDelta(frame.data);
      if (delta) {
        full += delta;
        onDelta(delta);
      }
      if (isTerminal(frame)) break;
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("network", `Stream interrupted: ${String(e)}`);
  }
  return full;
}

/** Archive (soft-delete) a side thread on bubble close. (PRD 6.5) */
export async function archiveThread(threadId: ThreadId): Promise<void> {
  const org = await getOrgId();
  await request(`/organizations/${org}/chat_conversations/${threadId}`, {
    method: "DELETE"
  });
}

/**
 * Best-effort read of the session usage percentage the host app already shows.
 * (PRD 6.6) The exact endpoint/shape is unstable; on any failure we return an
 * unknown usage rather than throwing, since usage display is non-critical.
 */
export async function getUsage(): Promise<Usage> {
  try {
    const org = await getOrgId();
    const res = await fetch(`${API_BASE}/organizations/${org}/usage`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    if (!res.ok) return { percent: null };
    const json = (await res.json()) as Record<string, unknown>;
    const pct =
      pickNumber(json, ["percentage", "used_percentage", "usage_percentage"]) ??
      derivePercent(json);
    return { percent: pct, raw: typeof json === "object" ? JSON.stringify(json) : undefined };
  } catch {
    return { percent: null };
  }
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return Math.max(0, Math.min(100, Math.round(v)));
  }
  return null;
}

function derivePercent(obj: Record<string, unknown>): number | null {
  const used = obj.used ?? obj.used_count;
  const limit = obj.limit ?? obj.total ?? obj.max;
  if (typeof used === "number" && typeof limit === "number" && limit > 0) {
    return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
  }
  return null;
}

/** Test hook: reset the memoized org id (used from the devtools console). */
export function __resetOrgCache(): void {
  cachedOrgId = null;
}
