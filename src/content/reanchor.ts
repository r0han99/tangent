/**
 * Soft re-anchoring: find an excerpt string in the conversation DOM and return
 * a Range. Prefer the message block that originally owned the highlight
 * (messageIndex). If the text is gone, return null — caller skips silently.
 */

/** Index of the `.standard-markdown` block containing a Range, or -1. */
export function getMessageIndex(range: Range): number {
  const node = range.commonAncestorContainer;
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  const block = el?.closest(".standard-markdown");
  if (!block) return -1;
  const all = Array.from(document.querySelectorAll("main .standard-markdown"));
  return all.indexOf(block);
}

/** Locate `excerpt` in the page; prefer `messageIndex` when valid. */
export function findExcerptRange(excerpt: string, messageIndex: number): Range | null {
  const needle = excerpt;
  if (!needle) return null;

  const blocks = Array.from(
    document.querySelectorAll<HTMLElement>("main .standard-markdown")
  );

  const ordered: HTMLElement[] = [];
  if (messageIndex >= 0 && messageIndex < blocks.length) {
    ordered.push(blocks[messageIndex]);
  }
  for (const b of blocks) {
    if (!ordered.includes(b)) ordered.push(b);
  }

  for (const block of ordered) {
    const hit = findTextRange(block, needle);
    if (hit) return hit;
  }

  const main = document.querySelector<HTMLElement>("main");
  if (main) return findTextRange(main, needle);
  return null;
}

/**
 * Find `needle` inside `root` by concatenating text nodes and mapping offsets
 * back to a DOM Range. Tries an exact match, then whitespace-normalized.
 */
function findTextRange(root: HTMLElement, needle: string): Range | null {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let full = "";
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    nodes.push(t);
    full += t.nodeValue ?? "";
  }
  if (!full) return null;

  let start = full.indexOf(needle);
  let end = start + needle.length;

  if (start === -1) {
    const { norm, map } = buildNormMap(full);
    const normNeedle = needle.replace(/\s+/g, " ").trim();
    const ni = norm.indexOf(normNeedle);
    if (ni === -1) return null;
    start = map[ni] ?? -1;
    const last = map[ni + normNeedle.length - 1];
    if (start < 0 || last == null) return null;
    end = last + 1;
  }

  return offsetsToRange(nodes, start, end);
}

/** Collapse whitespace runs to a single space; map[normIndex] → rawIndex. */
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
