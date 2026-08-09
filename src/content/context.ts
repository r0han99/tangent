import { CONTEXT_MAX_CHARS, CONTEXT_WINDOW_CHARS } from "@/config";

const BLOCK_SELECTOR = "p, li, blockquote, pre, h1, h2, h3, h4, h5, h6, td, th, dd, dt";

/**
 * Capture the paragraph/block the highlight sits in, to pass as <context> so
 * the model can resolve references in the excerpt without the full transcript.
 *
 * Returns "" when the block adds nothing beyond the excerpt itself.
 */
export function getSurroundingContext(range: Range, excerpt: string): string {
  const startEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;
  if (!startEl) return "";

  const block =
    startEl.closest(BLOCK_SELECTOR) ??
    startEl.closest(".standard-markdown") ??
    null;
  if (!block) return "";

  const raw = (block.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";

  const cleanExcerpt = excerpt.replace(/\s+/g, " ").trim();

  // If the block is essentially just the excerpt, context adds no value.
  if (raw === cleanExcerpt || raw.length - cleanExcerpt.length < 8) return "";

  if (raw.length <= CONTEXT_MAX_CHARS) return raw;

  // Window around the excerpt for very long blocks.
  const idx = raw.indexOf(cleanExcerpt);
  if (idx === -1) return raw.slice(0, CONTEXT_MAX_CHARS) + "…";

  const start = Math.max(0, idx - CONTEXT_WINDOW_CHARS);
  const end = Math.min(raw.length, idx + cleanExcerpt.length + CONTEXT_WINDOW_CHARS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < raw.length ? "…" : "";
  return prefix + raw.slice(start, end) + suffix;
}
