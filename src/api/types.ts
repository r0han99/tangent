/** Branded ids so a thread id can't be passed where an org id is expected. */
export type ThreadId = string & { readonly __brand: "ThreadId" };
export type OrgId = string & { readonly __brand: "OrgId" };

export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

/**
 * Models offered per-bubble. (PRD 6.6) The default should be a smaller, faster
 * model because tangents are cheap trivia lookups, not deep reasoning.
 *
 * `id` is the string claude.ai's completion endpoint expects. Reverse-engineer
 * the exact accepted values from the network tab; these are best-effort.
 */
export interface ModelOption {
  id: string;
  label: string;
}

/**
 * Best-effort model ids. claude.ai's web app may use different slugs than the
 * public API — confirm against a live completion Payload → `model` field.
 */
export const MODELS: ModelOption[] = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (fast, default)" },
  { id: "claude-sonnet-4-5", label: "Sonnet 4.5" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-opus-4-7", label: "Opus 4.7" }
];

export const DEFAULT_MODEL_ID = MODELS[0].id;

/** Typed error surface so the UI can render specific empty/error states. (PRD 7) */
export type ApiErrorKind =
  | "network" // offline / fetch threw
  | "auth" // 401 – session cookie expired
  | "model" // model_not_available / unsupported model id
  | "rate_limit" // 429 – weekly/quota hit
  | "not_found" // org/thread missing
  | "server" // 5xx
  | "parse" // response wasn't shaped as expected
  | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  /** For rate limits: the human-readable limit description, if surfaced. */
  detail?: string;

  constructor(kind: ApiErrorKind, message: string, status?: number, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

export interface Usage {
  /** Percentage of the session/weekly quota consumed, 0–100, if known. (PRD 6.6) */
  percent: number | null;
  raw?: string;
}
