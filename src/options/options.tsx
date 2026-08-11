import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import markUrl from "../../offthread-transparent.png";
import "./options.css";

/**
 * Storage / model constants are inlined here on purpose.
 * Importing shared @/ modules would pull Options into the same Vite chunk as
 * the content script (Chrome: cross-world resource mismatch).
 */
const STORAGE_KEYS = {
  defaultModel: "offthread.defaultModel",
  archiveOnClose: "offthread.archiveOnClose",
  dontAskArchive: "offthread.dontAskArchive"
} as const;
const LEGACY_STORAGE_KEYS = {
  defaultModel: "tangent.defaultModel",
  archiveOnClose: "tangent.archiveOnClose",
  dontAskArchive: "tangent.dontAskArchive"
} as const;
const API_KEY_STORAGE = "offthread.apiKey";
const API_PROVIDER_STORAGE = "offthread.apiProvider";
const OPENAI_API_KEY_STORAGE = "offthread.openaiApiKey";
const GEMINI_API_KEY_STORAGE = "offthread.geminiApiKey";

/** Claude-only — ChatGPT/Gemini pages lock to the selected provider's Offthread model. */
const MODELS = [{ id: "claude-haiku-4-5", label: "Claude · Haiku 4.5" }];
const DEFAULT_MODEL_ID = MODELS[0].id;

type ApiProviderId = "openai" | "gemini";

const PROVIDER_OPTIONS: {
  id: ApiProviderId;
  label: string;
  placeholder: string;
  docsUrl: string;
  docsLabel: string;
  lockedLabel: string;
}[] = [
  {
    id: "openai",
    label: "OpenAI",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
    docsLabel: "platform.openai.com/api-keys",
    lockedLabel: "GPT-Offthread (gpt-4o)"
  },
  {
    id: "gemini",
    label: "Gemini",
    placeholder: "AIza...",
    docsUrl: "https://aistudio.google.com/apikey",
    docsLabel: "aistudio.google.com/apikey",
    lockedLabel: "Gemini-Offthread (gemini-2.5-flash)"
  }
];

const COMING_SOON_PROVIDERS = ["Anthropic", "Mistral", "Grok"] as const;

function alive(): boolean {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

async function migrateSyncPrefs(): Promise<void> {
  if (!alive()) return;
  await new Promise<void>((resolve) => {
    chrome.storage.sync.get(
      [...Object.values(STORAGE_KEYS), ...Object.values(LEGACY_STORAGE_KEYS)],
      (res) => {
        if (chrome.runtime.lastError) {
          resolve();
          return;
        }
        const patch: Record<string, unknown> = {};
        if (
          res[STORAGE_KEYS.defaultModel] == null &&
          res[LEGACY_STORAGE_KEYS.defaultModel] != null
        ) {
          patch[STORAGE_KEYS.defaultModel] = res[LEGACY_STORAGE_KEYS.defaultModel];
        }
        if (
          res[STORAGE_KEYS.archiveOnClose] == null &&
          res[LEGACY_STORAGE_KEYS.archiveOnClose] != null
        ) {
          patch[STORAGE_KEYS.archiveOnClose] = res[LEGACY_STORAGE_KEYS.archiveOnClose];
        }
        if (
          res[STORAGE_KEYS.dontAskArchive] == null &&
          res[LEGACY_STORAGE_KEYS.dontAskArchive] != null
        ) {
          patch[STORAGE_KEYS.dontAskArchive] = res[LEGACY_STORAGE_KEYS.dontAskArchive];
        }
        if (Object.keys(patch).length === 0) {
          resolve();
          return;
        }
        chrome.storage.sync.set(patch, () => resolve());
      }
    );
  });
}

async function readProviderPrefs(): Promise<{
  provider: ApiProviderId;
  apiKey: string;
}> {
  if (!alive()) return { provider: "openai", apiKey: "" };
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [API_KEY_STORAGE, API_PROVIDER_STORAGE, OPENAI_API_KEY_STORAGE, GEMINI_API_KEY_STORAGE],
      (res) => {
        if (chrome.runtime.lastError) {
          resolve({ provider: "openai", apiKey: "" });
          return;
        }

        let provider: ApiProviderId =
          res?.[API_PROVIDER_STORAGE] === "gemini" ? "gemini" : "openai";
        let apiKey =
          typeof res?.[API_KEY_STORAGE] === "string" ? res[API_KEY_STORAGE].trim() : "";

        if (!apiKey) {
          const openai =
            typeof res?.[OPENAI_API_KEY_STORAGE] === "string"
              ? res[OPENAI_API_KEY_STORAGE].trim()
              : "";
          const gemini =
            typeof res?.[GEMINI_API_KEY_STORAGE] === "string"
              ? res[GEMINI_API_KEY_STORAGE].trim()
              : "";
          if (gemini && !openai) provider = "gemini";
          apiKey = provider === "gemini" ? gemini : openai || gemini;
          if (apiKey) {
            chrome.storage.local.set({
              [API_PROVIDER_STORAGE]: provider,
              [API_KEY_STORAGE]: apiKey
            });
          }
        }

        resolve({ provider, apiKey });
      }
    );
  });
}

interface Prefs {
  defaultModel: string;
  archiveOnClose: boolean;
  dontAskArchive: boolean;
}

const DEFAULTS: Prefs = {
  defaultModel: DEFAULT_MODEL_ID,
  archiveOnClose: false,
  dontAskArchive: false
};

function ThreadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "brand-thread"}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 3.5c5-2 7 2.5 3 4C1.5 10 2 15 5 16c5 2 9-10 14-7s.5 13.5-4 12c-5-2.5.5-11 6-2" />
    </svg>
  );
}

function Options() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [provider, setProvider] = useState<ApiProviderId>("openai");
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void migrateSyncPrefs()
      .then(() => readProviderPrefs())
      .then((p) => {
        if (!alive()) return;
        setProvider(p.provider);
        setApiKey(p.apiKey);
        chrome.storage.sync.get(Object.values(STORAGE_KEYS), (res) => {
          if (chrome.runtime.lastError) return;
          const stored = res[STORAGE_KEYS.defaultModel];
          const defaultModel =
            typeof stored === "string" && MODELS.some((m) => m.id === stored)
              ? stored
              : DEFAULTS.defaultModel;
          setPrefs({
            defaultModel,
            archiveOnClose: res[STORAGE_KEYS.archiveOnClose] ?? DEFAULTS.archiveOnClose,
            dontAskArchive: res[STORAGE_KEYS.dontAskArchive] ?? DEFAULTS.dontAskArchive
          });
        });
      })
      .catch(() => {
        /* extension reloaded mid-load */
      });
  }, []);

  const flashSaved = () => {
    if (!alive()) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const saveProvider = (next: ApiProviderId) => {
    if (!alive()) return;
    setProvider(next);
    chrome.storage.local.set({ [API_PROVIDER_STORAGE]: next }, flashSaved);
  };

  const saveApiKey = (value: string) => {
    if (!alive()) return;
    setApiKey(value);
    chrome.storage.local.set({ [API_KEY_STORAGE]: value.trim() }, flashSaved);
  };

  const update = (patch: Partial<Prefs>) => {
    if (!alive()) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    chrome.storage.sync.set(
      {
        [STORAGE_KEYS.defaultModel]: next.defaultModel,
        [STORAGE_KEYS.archiveOnClose]: next.archiveOnClose,
        [STORAGE_KEYS.dontAskArchive]: next.dontAskArchive
      },
      flashSaved
    );
  };

  const activeMeta = PROVIDER_OPTIONS.find((p) => p.id === provider) ?? PROVIDER_OPTIONS[0];

  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <span className="logo">
            Offthread
            <ThreadIcon />
          </span>
          <span className="header-tag">Options</span>
        </div>
      </header>

      <main className="page">
        <div className="hero">
          <img className="hero__mark" src={markUrl} alt="" width={68} height={68} />
          <h1 className="hero__brand">
            Offthread
            <ThreadIcon />
          </h1>
        </div>
        <p className="sub">
          Margin notes for Claude, ChatGPT, and Gemini. Preferences sync across your Chrome
          profile; your API key stays on this device only.
        </p>

        <section className="panel">
          <h2 className="panel__title">Defaults</h2>
          <p className="panel__lede">
            Claude bubbles can pick a model. ChatGPT and Gemini always use the locked Offthread
            model for your selected API (no picker).
          </p>
          <label className="field">
            <span className="label">Claude default model</span>
            <select
              value={prefs.defaultModel}
              onChange={(e) => update({ defaultModel: e.target.value })}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="panel">
          <h2 className="panel__title">Closing bubbles</h2>
          <p className="panel__lede">Keep host sidebars from filling with offthreads.</p>
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.archiveOnClose}
              onChange={(e) => update({ archiveOnClose: e.target.checked })}
            />
            <span>
              <span className="label">Archive the side thread when I close a bubble</span>
              <span className="hint">Archives the underlying host thread on close.</span>
            </span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.dontAskArchive}
              onChange={(e) => update({ dontAskArchive: e.target.checked })}
            />
            <span>
              <span className="label">Don't ask about archiving each time</span>
              <span className="hint">Apply the choice above silently on close.</span>
            </span>
          </label>
        </section>

        <section className="panel">
          <h2 className="panel__title">API provider</h2>
          <p className="panel__lede">
            Pick one provider and one key — Offthread uses it on both ChatGPT and Gemini.
            Claude still uses your logged-in session.
          </p>

          <div className="provider-grid" role="listbox" aria-label="API provider">
            {PROVIDER_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={provider === p.id}
                className={`provider-chip${provider === p.id ? " provider-chip--active" : ""}`}
                onClick={() => saveProvider(p.id)}
              >
                {p.label}
              </button>
            ))}
            {COMING_SOON_PROVIDERS.map((label) => (
              <button
                key={label}
                type="button"
                className="provider-chip provider-chip--soon"
                disabled
                title="Coming soon"
              >
                {label}
                <span className="soon-tag">Soon</span>
              </button>
            ))}
          </div>

          <label className="field">
            <span className="label">{activeMeta.label} API key</span>
            <span className="hint">
              Runs as {activeMeta.lockedLabel} on ChatGPT and Gemini. Get a key at{" "}
              <a href={activeMeta.docsUrl} target="_blank" rel="noreferrer">
                {activeMeta.docsLabel}
              </a>
              .
            </span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={activeMeta.placeholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={(e) => saveApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveApiKey(apiKey);
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <button type="button" className="btn" onClick={() => saveApiKey(apiKey)}>
              Save API key
            </button>
          </label>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <span>Offthread · Options</span>
          <a
            className="footer-site"
            href="https://r0han99.github.io/tangent/"
            target="_blank"
            rel="noreferrer"
          >
            r0han99.github.io/tangent
          </a>
        </div>
      </footer>

      <div className={`saved${saved ? " saved--show" : ""}`}>Saved</div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Options />
  </StrictMode>
);
