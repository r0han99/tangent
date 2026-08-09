import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MODELS, DEFAULT_MODEL_ID } from "@/api/types";
import { STORAGE_KEYS } from "@/config";
import "./options.css";

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

function Options() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage?.sync.get(Object.values(STORAGE_KEYS), (res) => {
      setPrefs({
        defaultModel: res[STORAGE_KEYS.defaultModel] ?? DEFAULTS.defaultModel,
        archiveOnClose: res[STORAGE_KEYS.archiveOnClose] ?? DEFAULTS.archiveOnClose,
        dontAskArchive: res[STORAGE_KEYS.dontAskArchive] ?? DEFAULTS.dontAskArchive
      });
    });
  }, []);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    chrome.storage?.sync.set(
      {
        [STORAGE_KEYS.defaultModel]: next.defaultModel,
        [STORAGE_KEYS.archiveOnClose]: next.archiveOnClose,
        [STORAGE_KEYS.dontAskArchive]: next.dontAskArchive
      },
      () => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1200);
      }
    );
  };

  return (
    <main className="wrap">
      <h1>Tangent</h1>
      <p className="sub">Margin comments for claude.ai. Settings sync across your Chrome profile.</p>

      <section>
        <label className="field">
          <span className="label">Default model for tangents</span>
          <span className="hint">
            Tangents are cheap lookups, so a smaller, faster model is the default. You can still
            change the model per bubble.
          </span>
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

      <section>
        <label className="check">
          <input
            type="checkbox"
            checked={prefs.archiveOnClose}
            onChange={(e) => update({ archiveOnClose: e.target.checked })}
          />
          <span>
            <span className="label">Archive the side thread when I close a bubble</span>
            <span className="hint">Keeps your claude.ai sidebar from filling with tangents.</span>
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

      <div className={`saved${saved ? " saved--show" : ""}`}>Saved</div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Options />
  </StrictMode>
);
