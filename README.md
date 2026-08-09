<p align="center">
  <img src="tangent.png" alt="Tangent logo" width="120" />
</p>

<h1 align="center">Tangent</h1>

<p align="center">
  Margin comments for <a href="https://claude.ai">claude.ai</a>
</p>

Highlight any span of a Claude message, a bubble opens in a right-hand gutter next
to that text, and you ask a short question about just that excerpt. The answer
streams into the bubble. **The main conversation is never touched.**

The model behind the bubble is your own already-authenticated Claude session — no
second login, no API key.

> Chrome extension, Manifest V3. See [`tangent-prd-mvp.md`](./tangent-prd-mvp.md) for the full product spec. · [Site](https://r0han99.github.io/tangent/)

## How it works

- The content script runs inside `claude.ai`, so `fetch` carries your session
  cookie automatically. All network calls are isolated in a single file,
  [`src/api/client.ts`](./src/api/client.ts) — the only place `fetch` appears.
- Highlights are painted with the **CSS Custom Highlight API**, not `<span>`
  wrapping, so React re-renders during streaming can't clobber them.
- Each bubble is its own real claude.ai side thread. Its context is exactly: a
  system instruction, the highlighted excerpt, your question, and the bubble's
  own prior turns — never the main transcript.

## Develop

```bash
npm install
npm run dev      # Vite + HMR; load dist/ as an unpacked extension
npm run build    # typecheck + production build into dist/
npm run typecheck
npm run pack     # build + zip dist/ for Chrome Web Store upload
```

### Load in Chrome

1. `npm run build` (or `npm run dev`).
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. Open `claude.ai`, select text in any message, click **Ask Tangent**.

## Chrome Web Store

Store submission materials live in [`STORE.md`](./STORE.md).

Public site (GitHub Pages from `main` / root):

- Landing: https://r0han99.github.io/tangent/
- Privacy: https://r0han99.github.io/tangent/privacy.html

```bash
npm run pack   # writes tangent-<version>.zip at the repo root
```

Upload that zip in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). You still need screenshots; see the checklist in `STORE.md`.

## Project layout

```
src/
  content/   entry, selection capture, highlight painting, host layout
  gutter/    Gutter (stacking), Bubble, Composer, stack.ts
  api/       client.ts (ONLY network file), sse.ts, types.ts
  state/     zustand store: bubbles, active bubble, usage
  options/   options page (default model, archive-on-close)
  config.ts  every layout/behavior constant and the system instruction
```

## Milestones (from the PRD)

- **M1** gutter + selection + highlighting + stacking (no network) — done
- **M2** isolated API client + SSE streaming — done; exercise it from the
  devtools console via `window.__tangent` on any claude.ai tab
- **M3** integration: real questions/answers, per-bubble threads, follow-ups — done
- **M4** auto-titling, archive-on-close, per-bubble model selector, usage
  footer, narrow-viewport popover fallback, options page — done

### Testing the API layer standalone (M2)

On a `claude.ai` tab with the extension loaded, open devtools:

```js
const t = await window.__tangent.createThread("Tangent: scratch");
const res = await window.__tangent.sendMessage(t, "Say hi in three words.");
await window.__tangent.streamReply(res, (d) => console.log(d));
```

## Caveats

- **Internal endpoints.** claude.ai's endpoints are undocumented app plumbing and
  can change without notice. When something breaks, re-observe the network tab and
  fix `src/api/client.ts` — nothing else touches the network. The request shapes in
  that file are best-effort and should be verified against live traffic.
- **Soft persistence.** Bubbles are saved per conversation in `chrome.storage.local`
  and re-anchored when you reload or return to the thread. If the excerpt is gone
  from the DOM, that bubble is skipped silently.
- **Chromium only.** Requires the CSS Custom Highlight API (Chrome 105+).
- **Terms of service.** This drives your own session from your own browser. Review
  Anthropic's usage policies before relying on it (PRD §9).
