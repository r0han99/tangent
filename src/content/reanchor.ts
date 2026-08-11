import { getHost } from "@/hosts/resolve";
import { findExcerptRange as findInBlocks, getMessageIndex as indexInBlocks } from "@/hosts/dom";

export function getMessageIndex(range: Range): number {
  return indexInBlocks(range, getHost().messageBlockSelector);
}

export function findExcerptRange(excerpt: string, messageIndex: number): Range | null {
  return findInBlocks(excerpt, messageIndex, getHost().messageBlockSelector);
}
