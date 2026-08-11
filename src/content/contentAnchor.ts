import { GUTTER_WIDTH, GUTTER_GAP } from "@/config";
import { getHost } from "@/hosts/resolve";
import { getContentColumnRight as columnRight } from "@/hosts/dom";

export function getContentColumnRight(from?: Range | null): number {
  const fallback = Math.max(GUTTER_GAP, window.innerWidth - GUTTER_WIDTH - GUTTER_GAP * 2);
  return columnRight(from, getHost().messageBlockSelector, fallback);
}

export function getGutterLeft(from?: Range | null): number {
  const contentRight = getContentColumnRight(from);
  const preferred = contentRight + GUTTER_GAP;
  const maxLeft = window.innerWidth - GUTTER_WIDTH - GUTTER_GAP;
  return Math.max(GUTTER_GAP, Math.min(preferred, maxLeft));
}
