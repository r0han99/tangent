import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import { fileURLToPath, URL } from "node:url";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  build: {
    // Avoid <link rel="modulepreload"> of content-script chunks from the
    // options page (Chrome: "cross-world extension resource mismatch").
    modulePreload: false,
    rollupOptions: {
      output: {
        // Keep React/vendor out of the content-script WAR chunk name when
        // possible by giving options its own stable vendor file.
        manualChunks(id) {
          if (id.includes("src/options/")) return;
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) {
            return "react-vendor";
          }
        }
      }
    }
  },
  server: {
    // crxjs needs a stable port for HMR of the content script
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    }
  }
});
