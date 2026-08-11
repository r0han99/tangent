import type { ModelOption } from "@/api/types";

/** Fixed Gemini API model used under the hood for Offthread. */
export const GEMINI_API_MODEL_ID = "gemini-2.5-flash";

export const GEMINI_MODELS: ModelOption[] = [
  { id: GEMINI_API_MODEL_ID, label: "Gemini-Offthread" }
];

export const GEMINI_DEFAULT_MODEL = GEMINI_API_MODEL_ID;
