import type { ModelOption, ThreadId, Usage } from "@/api/types";

export type HostId = "claude" | "chatgpt" | "gemini";

export interface SendOptions {
  model?: string;
  system?: string;
  signal?: AbortSignal;
}

export interface HostApi {
  createThread(title: string, model?: string): Promise<ThreadId>;
  sendMessage(threadId: ThreadId, content: string, opts?: SendOptions): Promise<Response>;
  streamReply(
    response: Response,
    onDelta: (text: string) => void,
    signal?: AbortSignal
  ): Promise<string>;
  archiveThread(threadId: ThreadId): Promise<void>;
  getUsage(): Promise<Usage>;
}

export interface SelectionStrategy {
  /** Host selection toolbar to mount beside (Claude Reply). Empty = fixed only. */
  tooltipSelector: string;
  replyButtonPattern: RegExp;
}

export interface HostAdapter {
  id: HostId;
  label: string;
  matches: string[];
  models: ModelOption[];
  defaultModel: string;
  messageBlockSelector: string;
  columnSelectors: string[];
  selection: SelectionStrategy;
  selectableRootSelector: string;
  getConversationId(href?: string): string | null;
  persistKey(conversationId: string): string;
  api: HostApi;
}
