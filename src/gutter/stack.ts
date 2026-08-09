import { BUBBLE_STACK_GAP } from "@/config";

export interface StackInput {
  id: string;
  /** Desired top offset in gutter coordinate space (px). */
  desiredTop: number;
  /** Measured rendered height (px). */
  height: number;
}

export interface StackResult {
  id: string;
  /** Resolved top after collision resolution (px). */
  top: number;
  /** Original desired top, so the view can draw a connector when displaced. */
  desiredTop: number;
  /** True when resolved top differs from desired: render a connector. (PRD 6.3) */
  displaced: boolean;
}

/**
 * Single-pass collision resolution. (PRD 6.3)
 *
 * Sort by desired top, then walk in order clamping each top to
 * max(desired, previousBottom + GAP). Bubbles whose resolved top differs from
 * their desired top are marked displaced so the view draws a connector line
 * back up to their highlight. This is the Word behavior; without it,
 * overlapping bubbles make dense text unusable.
 */
export function resolveStack(inputs: StackInput[]): StackResult[] {
  const sorted = [...inputs].sort((a, b) => a.desiredTop - b.desiredTop);

  const results: StackResult[] = [];
  let previousBottom = -Infinity;

  for (const item of sorted) {
    const top = Math.max(item.desiredTop, previousBottom + BUBBLE_STACK_GAP);
    results.push({
      id: item.id,
      top,
      desiredTop: item.desiredTop,
      // Use a sub-pixel epsilon so float noise doesn't spuriously flag displacement.
      displaced: top - item.desiredTop > 0.5
    });
    previousBottom = top + item.height;
  }

  return results;
}
