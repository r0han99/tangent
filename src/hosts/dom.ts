/**
 * Shared DOM helpers for re-anchoring excerpts inside host message blocks.
 */

export function getMessageIndex(range: Range, blockSelector: string): number {
  const node = range.commonAncestorContainer;
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  const block = el?.closest(blockSelector);
  if (!block) return -1;
  const all = Array.from(document.querySelectorAll(blockSelector));
  return all.indexOf(block);
}

export function findExcerptRange(
  excerpt: string,
  messageIndex: number,
  blockSelector: string
): Range | null {
  if (!excerpt) return null;

  const blocks = Array.from(document.querySelectorAll<HTMLElement>(blockSelector));

  // Cheap path: try the original message block first.
  if (messageIndex >= 0 && messageIndex < blocks.length) {
    const hit = findTextRange(blocks[messageIndex], excerpt);
    if (hit) return hit;
  }

  // Then other message blocks only — never walk all of <main>/body (ChatGPT
  // threads are huge; that freezes the tab during restore).
  for (let i = 0; i < blocks.length; i++) {
    if (i === messageIndex) continue;
    const hit = findTextRange(blocks[i], excerpt);
    if (hit) return hit;
  }

  return null;
}

/** Cap text concatenation so a single pathological block can't freeze the tab. */
const MAX_SCAN_CHARS = 80_000;

function findTextRange(root: HTMLElement, needle: string): Range | null {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let full = "";
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    const value = t.nodeValue ?? "";
    if (!value) continue;
    nodes.push(t);
    full += value;
    if (full.length > MAX_SCAN_CHARS) break;
  }
  if (!full) return null;

  let start = full.indexOf(needle);
  let end = start + needle.length;

  if (start === -1) {
    const { norm, map } = buildNormMap(full);
    const normNeedle = needle.replace(/\s+/g, " ").trim();
    if (!normNeedle || normNeedle.length > MAX_SCAN_CHARS) return null;
    const ni = norm.indexOf(normNeedle);
    if (ni === -1) return null;
    start = map[ni] ?? -1;
    const last = map[ni + normNeedle.length - 1];
    if (start < 0 || last == null) return null;
    end = last + 1;
  }

  return offsetsToRange(nodes, start, end);
}

function buildNormMap(raw: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let i = 0;
  let inSpace = false;
  while (i < raw.length) {
    if (/\s/.test(raw[i])) {
      if (!inSpace) {
        map.push(i);
        norm += " ";
        inSpace = true;
      }
      i++;
    } else {
      map.push(i);
      norm += raw[i];
      inSpace = false;
      i++;
    }
  }
  return { norm, map };
}

function offsetsToRange(nodes: Text[], start: number, end: number): Range | null {
  let cursor = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  for (const node of nodes) {
    const len = node.nodeValue?.length ?? 0;
    if (!startNode && cursor + len >= start) {
      startNode = node;
      startOffset = start - cursor;
    }
    if (!endNode && cursor + len >= end) {
      endNode = node;
      endOffset = end - cursor;
      break;
    }
    cursor += len;
  }

  if (!startNode || !endNode) return null;
  try {
    const range = document.createRange();
    range.setStart(startNode, Math.min(startOffset, startNode.length));
    range.setEnd(endNode, Math.min(endOffset, endNode.length));
    if (range.collapsed) return null;
    return range;
  } catch {
    return null;
  }
}

export function getContentColumnRight(
  from: Range | null | undefined,
  blockSelector: string,
  fallbackRight: number
): number {
  if (from) {
    const node = from.commonAncestorContainer;
    const el =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;
    const md = el?.closest(blockSelector);
    if (md) return md.getBoundingClientRect().right;
  }

  let best: DOMRect | null = null;
  for (const el of document.querySelectorAll<HTMLElement>(blockSelector)) {
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 20) continue;
    if (!best || r.height > best.height) best = r;
  }
  if (best) return best.right;
  return fallbackRight;
}
