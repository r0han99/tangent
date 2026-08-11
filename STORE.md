# Chrome Web Store listing

Paste-ready copy for the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

**Public site (after GitHub Pages is enabled on `main` / root):**  
https://r0han99.github.io/tangent/

**Privacy policy URL:**  
https://r0han99.github.io/tangent/privacy.html

**Upload package:** run `npm run pack`, then upload `offthread-2.0.0.zip` to the **existing** item (do not create a new listing).

---

## Listing fields

### Name
```
Offthread
```

### Summary (max 132 characters)
```
Ask questions about highlighted Claude, ChatGPT, or Gemini replies in side bubbles—without derailing the main chat.
```

### Description
```
Offthread (formerly Tangent) adds margin notes to Claude, ChatGPT, and Gemini. Highlight any span, click Ask Offthread, and ask a short question in a bubble next to the text. The answer streams into that bubble. Your main conversation stays untouched.

Features
• Ask Offthread on Claude, ChatGPT, and Gemini
• Side bubbles docked next to the message
• Streaming answers from your existing session (no API key)
• Follow-ups stay inside the bubble thread
• Soft persistence per conversation
• Collapsed chips that expand when you need them again

How to use
1. Install Offthread and sign in to Claude, ChatGPT, or Gemini as usual.
2. Open a conversation and highlight text in a reply.
3. Click Ask Offthread.
4. Type your question in the bubble and send.
5. Click outside to collapse; expand the chip later to continue.

Requirements
• Chromium-based browser with the CSS Custom Highlight API (Chrome 105+)
• An active session on the host you are using

Notes
• Runs on claude.ai, chatgpt.com, chat.openai.com, and gemini.google.com
• Uses the signed-in session in the page; there is no separate Offthread account
• Host web APIs can change; if something breaks, check for an extension update

Site: https://r0han99.github.io/tangent/
Source: https://github.com/r0han99/tangent
Privacy: https://r0han99.github.io/tangent/privacy.html
```

### Category
Productivity

### Language
English

---

## Single purpose

```
Provide margin Q&A on highlighted text in AI chat products (Claude, ChatGPT, Gemini) without modifying the main thread.
```

---

## Permission justifications

### storage
```
Stores extension preferences and soft-persists margin bubble threads (excerpt, messages, anchors) in chrome.storage.local so they survive refresh and returning to a conversation. Data stays on the user’s device.
```

### Content script hosts
```
Injects only on claude.ai, chatgpt.com, chat.openai.com, and gemini.google.com to capture text selection, paint highlights, and render the gutter UI. No other sites are matched.
```

---

## Privacy practices (questionnaire guidance)

Answer honestly in the developer console:

| Question area | Suggested answer |
|---------------|------------------|
| Handles user data? | Yes — highlight excerpts, questions, and bubble replies as needed to provide the feature |
| Remote code? | No |
| Sold to third parties? | No |
| Used for purposes unrelated to the feature? | No |
| Transferred to third parties? | Data is sent to claude.ai (Anthropic) using the user’s existing session to generate answers — the service the user is already using |
| Collection via other means? | No (no Tangent backend) |
| Data storage | Locally via chrome.storage.local; also subject to Anthropic’s policies once sent to claude.ai |

Privacy policy URL: `https://r0han99.github.io/tangent/privacy.html`

---

## Screenshots (you capture)

Chrome requires at least **one** screenshot. Prefer **1280×800** (or 640×400). Capture **3–5** if you can:

1. Selection + **Ask Tangent** next to Reply  
2. Open bubble with a short streamed answer  
3. Collapsed margin chip after an outside click  
4. Options page (default model / archive-on-close)

**Icon:** use `icons/icon128.png` (already in the package).

**Optional promo images (later):**
- Small tile: 440×280  
- Marquee: 1400×560  

---

## Submit checklist

1. Create / pay for a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) ($5 one-time).
2. Enable GitHub Pages on this repo: **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**, so the landing and `privacy.html` are public.
3. Confirm https://r0han99.github.io/tangent/ and the privacy URL load in an incognito window.
4. Run `npm run pack` and upload `tangent-1.0.0.zip`.
5. Paste the listing fields above.
6. Complete the privacy practices form.
7. Upload screenshots → **Submit for review**.

Review for a first listing often takes a few days to about two weeks.
