import type { HostAdapter } from "./types";
import { claudeHost } from "./claude";
import { chatgptHost } from "./chatgpt";
import { geminiHost } from "./gemini";

export const HOSTS: HostAdapter[] = [claudeHost, chatgptHost, geminiHost];

export function resolveHost(href: string = location.href): HostAdapter {
  let host = "";
  try {
    host = new URL(href).hostname;
  } catch {
    host = location.hostname;
  }

  if (host.includes("claude.ai")) return claudeHost;
  if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) return chatgptHost;
  if (host.includes("gemini.google.com")) return geminiHost;

  return claudeHost;
}

let cached: HostAdapter | null = null;

/** Current page host. Cached for the content-script lifetime. */
export function getHost(): HostAdapter {
  if (!cached) cached = resolveHost();
  return cached;
}
