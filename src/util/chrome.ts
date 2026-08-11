/**
 * Safe Chrome extension API access for content scripts.
 * After an extension reload, orphaned scripts throw
 * "Extension context invalidated" on any chrome.* touch —
 * including inside storage callbacks — so never touch chrome.*
 * without a try/catch once a call has gone async.
 */

export function extensionAlive(): boolean {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

type StorageArea = {
  get: typeof chrome.storage.local.get;
  set: typeof chrome.storage.local.set;
  remove: typeof chrome.storage.local.remove;
};

function area(name: "local" | "sync"): StorageArea | null {
  if (!extensionAlive()) return null;
  try {
    const a = chrome.storage?.[name];
    return a ? (a as StorageArea) : null;
  } catch {
    return null;
  }
}

export function storageLocal(): StorageArea | null {
  return area("local");
}

export function storageSync(): StorageArea | null {
  return area("sync");
}

/** chrome.storage.local.get that never rejects on invalidated context. */
export function localGet<T extends Record<string, unknown>>(
  keys: string | string[]
): Promise<T> {
  const a = storageLocal();
  if (!a) return Promise.resolve({} as T);
  return new Promise((resolve) => {
    try {
      a.get(keys, (res) => {
        // Do not read chrome.runtime here — context may already be dead.
        try {
          resolve((res ?? {}) as T);
        } catch {
          resolve({} as T);
        }
      });
    } catch {
      resolve({} as T);
    }
  });
}

/** chrome.storage.local.set that never rejects on invalidated context. */
export function localSet(items: Record<string, unknown>): Promise<void> {
  const a = storageLocal();
  if (!a) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      a.set(items, () => {
        try {
          resolve();
        } catch {
          resolve();
        }
      });
    } catch {
      resolve();
    }
  });
}

export function localRemove(keys: string | string[]): Promise<void> {
  const a = storageLocal();
  if (!a) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      a.remove(keys, () => {
        try {
          resolve();
        } catch {
          resolve();
        }
      });
    } catch {
      resolve();
    }
  });
}

export function syncGet<T extends Record<string, unknown>>(
  keys: string | string[]
): Promise<T> {
  const a = storageSync();
  if (!a) return Promise.resolve({} as T);
  return new Promise((resolve) => {
    try {
      a.get(keys, (res) => {
        try {
          resolve((res ?? {}) as T);
        } catch {
          resolve({} as T);
        }
      });
    } catch {
      resolve({} as T);
    }
  });
}

export function syncSet(items: Record<string, unknown>): Promise<void> {
  const a = storageSync();
  if (!a) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      a.set(items, () => {
        try {
          resolve();
        } catch {
          resolve();
        }
      });
    } catch {
      resolve();
    }
  });
}

export function onStorageChanged(
  listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
): () => void {
  if (!extensionAlive()) return () => {};
  try {
    if (!chrome.storage?.onChanged) return () => {};
    const wrapped = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      try {
        if (!extensionAlive()) return;
        listener(changes, area);
      } catch {
        /* ignore */
      }
    };
    chrome.storage.onChanged.addListener(wrapped);
    return () => {
      try {
        chrome.storage.onChanged.removeListener(wrapped);
      } catch {
        /* ignore */
      }
    };
  } catch {
    return () => {};
  }
}
