import type { ModelOption } from "@/api/types";

/** Fixed OpenAI model used under the hood for Offthread. */
export const CHATGPT_API_MODEL_ID = "gpt-4o";

export const CHATGPT_API_MODELS: ModelOption[] = [
  { id: CHATGPT_API_MODEL_ID, label: "GPT-Offthread" }
];

export const CHATGPT_API_DEFAULT_MODEL = CHATGPT_API_MODEL_ID;
export const CHATGPT_DEFAULT_MODEL = CHATGPT_API_MODEL_ID;

/** @deprecated dynamic catalog unused — Offthread locks to gpt-4o. */
export async function fetchOpenAiApiModels(_key: string): Promise<ModelOption[]> {
  return CHATGPT_API_MODELS.map((m) => ({ ...m }));
}
