import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from "@/config";
import { extensionAlive, localGet, localRemove, localSet, syncGet, syncSet } from "@/util/chrome";

let migrated = false;

/**
 * One-shot migration from pre-2.0 `tangent.*` keys to `offthread.*`.
 * Kept in its own module so the options page does not share a chunk with the
 * content-script persistence code (avoids Chrome WAR / modulepreload warnings).
 */
export async function migrateLegacy(): Promise<void> {
  if (!extensionAlive() || migrated) return;
  migrated = true;

  try {
    const res = await localGet<Record<string, unknown>>([
      STORAGE_KEYS.persist,
      LEGACY_STORAGE_KEYS.persist
    ]);
    if (!extensionAlive()) return;

    const next = res?.[STORAGE_KEYS.persist];
    const old = res?.[LEGACY_STORAGE_KEYS.persist];
    if (next && typeof next === "object") {
      /* already on offthread key */
    } else if (old && typeof old === "object") {
      const remapped: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(old as Record<string, unknown>)) {
        const nextKey = key.includes(":") ? key : `claude:${key}`;
        remapped[nextKey] =
          value && typeof value === "object"
            ? { ...(value as object), conversationId: nextKey }
            : value;
      }
      await localSet({ [STORAGE_KEYS.persist]: remapped });
      await localRemove(LEGACY_STORAGE_KEYS.persist);
    }

    const sync = await syncGet<Record<string, unknown>>([
      ...Object.values(STORAGE_KEYS),
      ...Object.values(LEGACY_STORAGE_KEYS)
    ]);
    if (!extensionAlive()) return;

    const patch: Record<string, unknown> = {};
    if (
      sync[STORAGE_KEYS.defaultModel] == null &&
      sync[LEGACY_STORAGE_KEYS.defaultModel] != null
    ) {
      patch[STORAGE_KEYS.defaultModel] = sync[LEGACY_STORAGE_KEYS.defaultModel];
    }
    if (
      sync[STORAGE_KEYS.archiveOnClose] == null &&
      sync[LEGACY_STORAGE_KEYS.archiveOnClose] != null
    ) {
      patch[STORAGE_KEYS.archiveOnClose] = sync[LEGACY_STORAGE_KEYS.archiveOnClose];
    }
    if (
      sync[STORAGE_KEYS.dontAskArchive] == null &&
      sync[LEGACY_STORAGE_KEYS.dontAskArchive] != null
    ) {
      patch[STORAGE_KEYS.dontAskArchive] = sync[LEGACY_STORAGE_KEYS.dontAskArchive];
    }
    if (Object.keys(patch).length > 0) {
      await syncSet(patch);
    }
  } catch {
    /* extension context gone mid-migration */
  }
}
