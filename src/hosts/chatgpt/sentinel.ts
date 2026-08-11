/**
 * ChatGPT sentinel gate: chat-requirements + proof-of-work headers.
 * Without valid tokens, /backend-api/conversation returns
 * "Unusual activity has been detected from your device."
 *
 * The proof-of-work uses SHA3-512 over `seed + base64(JSON(config))`, brute
 * forcing a nonce until the hash's hex prefix is <= the returned difficulty.
 * This mirrors the official web client's hash-wasm sha3-512 solver.
 */
import { sha3_512 } from "js-sha3";

const MAX_POW_ATTEMPTS = 500_000;

export interface SentinelHeaders {
  "oai-device-id": string;
  "oai-language": string;
  "openai-sentinel-chat-requirements-token": string;
  "openai-sentinel-proof-token": string;
}

interface ChatRequirements {
  token?: string;
  proofofwork?: {
    required?: boolean;
    seed?: string;
    difficulty?: string;
  };
  turnstile?: { required?: boolean };
  arkose?: { required?: boolean };
  so?: { required?: boolean };
}

/** Thrown when ChatGPT demands a challenge Offthread can't solve headlessly. */
export class ChallengeRequiredError extends Error {
  constructor(public kinds: string[]) {
    super(
      `ChatGPT requires an interactive security check (${kinds.join(
        ", "
      )}) that Offthread can't complete from an extension.`
    );
    this.name = "ChallengeRequiredError";
  }
}

export function getDeviceId(): string {
  const fromCookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith("oai-did="))
    ?.split("=")[1];
  if (fromCookie) return decodeURIComponent(fromCookie);
  try {
    const existing = localStorage.getItem("oai-did");
    if (existing) return existing;
  } catch {
    /* ignore */
  }
  const id = crypto.randomUUID();
  try {
    localStorage.setItem("oai-did", id);
  } catch {
    /* ignore */
  }
  return id;
}

/**
 * Screen/navigator config the client folds into the PoW payload. OpenAI cannot
 * verify most of these values; only the seed + difficulty + hash matter, so
 * plausible browser-shaped data is sufficient.
 */
function buildConfig(): unknown[] {
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  return [
    (screen.width || 1920) + (screen.height || 1080),
    new Date().toString(),
    (performance as Performance & { memory?: { jsHeapSizeLimit?: number } }).memory
      ?.jsHeapSizeLimit ?? 4294705152,
    0, // [3] nonce
    navigator.userAgent,
    location.href,
    "prod",
    navigator.language || "en-US",
    (navigator.languages || ["en-US"]).join(","),
    0, // [9] timing
    Math.round(performance.now()),
    "location",
    crypto.randomUUID(),
    "",
    cores,
    Date.now()
  ];
}

function b64(json: string): string {
  return btoa(unescape(encodeURIComponent(json)));
}

/**
 * Solve the SHA3-512 challenge. Returns the "gAAAAAB…" proof token.
 * Falls back to a well-known error token if the difficulty is never met.
 */
function generateAnswer(seed: string, difficulty: string): string {
  const config = buildConfig();
  const diff = difficulty.toLowerCase();
  const diffLen = diff.length;
  const start = performance.now();
  let encoded = "";

  for (let nonce = 0; nonce < MAX_POW_ATTEMPTS; nonce++) {
    config[3] = nonce;
    config[9] = Math.round(performance.now() - start);
    encoded = b64(JSON.stringify(config));
    const hash = sha3_512(seed + encoded);
    if (hash.slice(0, diffLen) <= diff) {
      return "gAAAAAB" + encoded;
    }
  }
  // Exhausted: web client returns this sentinel-shaped fallback.
  return "gAAAAAB" + "wQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D" + b64(`"${seed}"`);
}

/** Local requirements proof (`p` body field), trivial difficulty. */
function requirementsProof(): string {
  return generateAnswer(String(Math.random()), "0");
}

export async function fetchSentinelHeaders(accessToken: string): Promise<SentinelHeaders> {
  const deviceId = getDeviceId();
  const language = navigator.language || "en-US";
  const p = requirementsProof();

  const res = await fetch("/backend-api/sentinel/chat-requirements", {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "*/*",
      "oai-device-id": deviceId,
      "oai-language": language
    },
    body: JSON.stringify({ p })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.slice(0, 180) || `ChatGPT chat-requirements failed (${res.status}).`);
  }

  const json = (await res.json()) as ChatRequirements;
  const requirementsTokenHeader = json.token;
  if (!requirementsTokenHeader) {
    throw new Error("ChatGPT chat-requirements response missing token.");
  }

  const challenges: string[] = [];
  if (json.turnstile?.required) challenges.push("turnstile");
  if (json.arkose?.required) challenges.push("arkose");
  if (json.so?.required) challenges.push("device-attestation");
  if (challenges.length > 0) {
    throw new ChallengeRequiredError(challenges);
  }

  let proofToken = requirementsProof();
  const pow = json.proofofwork;
  if (pow?.required && pow.seed && pow.difficulty) {
    proofToken = generateAnswer(pow.seed, pow.difficulty);
  }

  return {
    "oai-device-id": deviceId,
    "oai-language": language,
    "openai-sentinel-chat-requirements-token": requirementsTokenHeader,
    "openai-sentinel-proof-token": proofToken
  };
}
