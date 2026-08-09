import { GUTTER_WIDTH, GUTTER_GAP } from "@/config";

/**
 * Right edge of the conversation text column — where the margin free-space
 * begins. Prefer the `.standard-markdown` that owns the selection.
 */
export function getContentColumnRight(from?: Range | null): number {
  if (from) {
    const node = from.commonAncestorContainer;
    const el =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;
    const md = el?.closest(".standard-markdown");
    if (md) return md.getBoundingClientRect().right;
  }

  let best: DOMRect | null = null;
  for (const el of document.querySelectorAll<HTMLElement>("main .standard-markdown")) {
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 20) continue;
    // Prefer the tallest visible column (the active message body).
    if (!best || r.height > best.height) best = r;
  }
  if (best) return best.right;

  return Math.max(GUTTER_GAP, window.innerWidth - GUTTER_WIDTH - GUTTER_GAP * 2);
}

/** Viewport left for a gutter that sits just after the text column. */
export function getGutterLeft(from?: Range | null): number {
  const contentRight = getContentColumnRight(from);
  const preferred = contentRight + GUTTER_GAP;
  const maxLeft = window.innerWidth - GUTTER_WIDTH - GUTTER_GAP;
  return Math.max(GUTTER_GAP, Math.min(preferred, maxLeft));
}
