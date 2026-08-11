import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Offthread",
  version: pkg.version,
  description: pkg.description,
  permissions: ["storage"],
  host_permissions: [
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*"
  ],
  background: {
    service_worker: "src/background.ts",
    type: "module"
  },
  content_scripts: [
    {
      matches: [
        "https://claude.ai/*",
        "https://chatgpt.com/*",
        "https://chat.openai.com/*",
        "https://gemini.google.com/*"
      ],
      js: ["src/content/index.tsx"],
      run_at: "document_idle"
    }
  ],
  options_ui: {
    page: "src/options/index.html",
    open_in_tab: true
  },
  action: {
    default_title: "Offthread",
    default_icon: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
});
