/**
 * Extract the claude.ai conversation id from the URL.
 * Matches /chat/<uuid> (and ignores project/share variants without a chat id).
 */
export function getConversationId(href: string = location.href): string | null {
  try {
    const url = new URL(href);
    const match = url.pathname.match(/\/chat\/([0-9a-f-]{36})/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
