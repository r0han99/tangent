# Chrome Web Store listing

Paste-ready copy for the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

**Public site (after GitHub Pages is enabled on `main` / root):**  
https://r0han99.github.io/tangent/

**Privacy policy URL:**  
https://r0han99.github.io/tangent/privacy.html

**Upload package:** run `npm run pack`, then upload `tangent-1.0.0.zip`.

---

## Listing fields

### Name
```
Tangent
```

### Summary (max 132 characters)
```
Ask questions about highlighted Claude replies in side bubbles—without derailing the main conversation.
```

### Description
```
Tangent adds margin notes to claude.ai. Highlight any span in a Claude message, click Ask Tangent, and ask a short question in a bubble next to the text. The answer streams into that bubble. Your main conversation stays untouched.

Features
• Ask Tangent button beside Claude’s Reply control
• Side bubbles docked in the free space next to the message
• Streaming answers from your existing Claude session (no API key)
• Follow-ups stay inside the bubble thread
• Soft persistence: bubbles return when you reload or revisit a chat
• Collapsed chips that expand when you need them again
• Options for default model and archive-on-close

How to use
1. Install Tangent and sign in to claude.ai as usual.
2. Open a conversation and highlight text in a Claude message.
3. Click Ask Tangent (next to Reply).
4. Type your question in the bubble and send.
5. Click outside to collapse; expand the chip later to continue.

Requirements
• Chromium-based browser with the CSS Custom Highlight API (Chrome 105+)
• An active claude.ai session

Notes
• Tangent runs only on https://claude.ai/*
• It uses your signed-in Claude session in the page; there is no separate Tangent account
• claude.ai’s web APIs can change; if something breaks, check for an extension update

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
Provide margin Q&A on highlighted text in claude.ai conversations without modifying the main thread.
```

---

## Permission justifications

### storage
```
Stores extension preferences and soft-persists margin bubble threads (excerpt, messages, anchors) in chrome.storage.local so they survive refresh and returning to a conversation. Data stays on the user’s device.
```

### Content script host: https://claude.ai/*
```
Injects only on claude.ai to capture text selection, paint highlights, and render the gutter UI and bubbles next to the conversation. No other sites are matched.
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
