import { HIGHLIGHT_PREFIX } from "@/config";

/**
 * CSS Custom Highlight API wrapper. (PRD 6.2)
 *
 * We paint highlights directly from Ranges via CSS.highlights.set(), never by
 * wrapping text in <span>. React owns the message DOM and discards injected
 * nodes on re-render (which happens constantly during streaming), but the
 * Highlight API paints from the Range without mutating the DOM, so there is
 * nothing for React to clobber.
 *
 * A custom highlight name maps to exactly one Highlight object (which may hold
 * many ranges). So instead of one registration per bubble, we keep two shared
 * Highlight objects — active and idle — and repaint them from our range map on
 * every change. This lets the stylesheet target two static names:
 *   ::highlight(tangent-active) and ::highlight(tangent-idle)
 */

const ACTIVE = `${HIGHLIGHT_PREFIX}-active`;
const IDLE = `${HIGHLIGHT_PREFIX}-idle`;

interface Entry {
  range: Range;
  active: boolean;
}

const entries = new Map<string, Entry>();

export const isHighlightApiSupported = (): boolean =>
  typeof Highlight !== "undefined" &&
  typeof CSS !== "undefined" &&
  "highlights" in CSS;

function repaint(): void {
  if (!isHighlightApiSupported()) return;
  const active = new Highlight();
  const idle = new Highlight();
  for (const { range, active: isActive } of entries.values()) {
    (isActive ? active : idle).add(range);
  }
  CSS.highlights.set(ACTIVE, active);
  CSS.highlights.set(IDLE, idle);
}

/** Register (or replace) the highlight for a bubble. */
export function setHighlight(bubbleId: string, range: Range, active: boolean): void {
  entries.set(bubbleId, { range, active });
  repaint();
}

/** Toggle a bubble between active and idle highlight styling. */
export function setHighlightActive(bubbleId: string, active: boolean): void {
  const entry = entries.get(bubbleId);
  if (!entry || entry.active === active) return;
  entry.active = active;
  repaint();
}

/** Remove a bubble's highlight entirely. */
export function clearHighlight(bubbleId: string): void {
  if (entries.delete(bubbleId)) repaint();
}

/** The live Range for a bubble, if still tracked. Used for scroll-into-view. */
export function getRange(bubbleId: string): Range | undefined {
  return entries.get(bubbleId)?.range;
}

export function clearAllHighlights(): void {
  entries.clear();
  if (isHighlightApiSupported()) {
    CSS.highlights.delete(ACTIVE);
    CSS.highlights.delete(IDLE);
  }
}
