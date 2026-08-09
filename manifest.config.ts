import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Tangent",
  version: pkg.version,
  description: pkg.description,
  // chrome.storage.local for soft bubble persistence across refresh / revisit.
  permissions: ["storage"],
  // The content script is same-origin with the page, so fetch carries the
  // session cookie automatically. No extra host_permissions are needed to
  // call claude.ai's own endpoints from within the page context.
  content_scripts: [
    {
      matches: ["https://claude.ai/*"],
      js: ["src/content/index.tsx"],
      run_at: "document_idle"
    }
  ],
  options_ui: {
    page: "src/options/index.html",
    open_in_tab: true
  },
  action: {
    default_title: "Tangent",
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
