import { getHost } from "@/hosts/resolve";

export function getConversationId(href: string = location.href): string | null {
  return getHost().getConversationId(href);
}

/** Host-namespaced id used as the persistence map key. */
export function getPersistConversationId(href: string = location.href): string | null {
  const id = getHost().getConversationId(href);
  return id ? getHost().persistKey(id) : null;
}
