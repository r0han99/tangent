/**
 * Network facade — delegates to the active host adapter.
 * Host-specific fetch lives in src/hosts/<vendor>/api.ts.
 */
import { getHost } from "@/hosts/resolve";
import type { ThreadId, Usage } from "./types";
import type { SendOptions } from "@/hosts/types";

export type { SendOptions };

export function createThread(title: string, model?: string): Promise<ThreadId> {
  return getHost().api.createThread(title, model);
}

export function sendMessage(
  threadId: ThreadId,
  content: string,
  opts: SendOptions = {}
): Promise<Response> {
  return getHost().api.sendMessage(threadId, content, opts);
}

export function streamReply(
  response: Response,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return getHost().api.streamReply(response, onDelta, signal);
}

export function archiveThread(threadId: ThreadId): Promise<void> {
  return getHost().api.archiveThread(threadId);
}

export function getUsage(): Promise<Usage> {
  return getHost().api.getUsage();
}
