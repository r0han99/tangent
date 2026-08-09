# Tangent

**Product Requirements Document, v1**
Author: Rohan Sai Nalla
Status: Draft for implementation

---

## 1. Summary

Tangent is a Chrome extension that adds margin comments to claude.ai. The user highlights any span of text in a Claude response, a bubble opens in a right-hand gutter next to that text, and the user asks a short question about the highlighted excerpt. The answer arrives in the bubble. The main conversation is never touched.

The model behind the bubble is the user's own already-authenticated Claude session. No second login, no API key.

## 2. Problem

Long planning conversations with Claude accumulate small factual gaps. In a discussion about building a macOS notch app, the user wants to know which MacBooks actually have a notch and what year it shipped. That question is a two-sentence lookup, but asking it in the main thread costs a full turn, injects an irrelevant exchange into the context, and derails the architectural argument that was in progress.

Today the only options are to ask anyway and accept the derailment, or to open a separate tab and lose the connection to the text that prompted the question. Claude's existing highlight-to-reply feature does not solve this: it still posts into the same thread.

## 3. Goals

- Ask a question about a highlighted excerpt without adding a turn to the main conversation.
- Keep the question visually attached to the text that prompted it.
- Zero additional authentication. Use the session already present in the browser.
- Fast enough that firing off a tangent feels cheaper than deciding whether to.

## 4. Non-goals for v1

- **Anchor persistence across reloads.** Bubbles live for the session. No fuzzy re-location, no `dom-anchor-text-quote`, no stored prefix and suffix offsets. See section 10 for the optional follow-on.
- **Full conversation context.** The side thread receives the highlighted excerpt only, plus the user's question. Not the parent message, not the transcript.
- **Promoting a tangent back into the main thread.** Deferred to v2.
- **Firefox and Safari.** Chromium only.
- **Non-Claude sites.**

## 5. Context model

This is the central product decision, so it is stated explicitly.

A Tangent thread's context is exactly:

1. A system instruction (see below)
2. The highlighted excerpt, verbatim
3. The user's question
4. Any prior turns within that same bubble

The system instruction exists to handle the known failure mode: an excerpt whose meaning depends on text outside it. Highlighting "a floating pill is the obvious answer but it's a different visual promise" and asking "why?" gives the model no way to know what pill or what product is meant. Rather than expanding context, the model is told to ask instead of guess.

```
The user has highlighted an excerpt from a longer conversation and is
asking a question about it. You do not have the surrounding conversation.
Answer concisely and directly.

If the excerpt is too ambiguous to answer without the surrounding context,
say so in one line and name the specific thing you need clarified. Do not
guess at what the excerpt refers to.

Keep answers short. This is a margin note, not a discussion.
```

Follow-up messages inside a bubble accumulate into that bubble's own `messages` array. They never see the main thread.

## 6. Architecture

Chrome Manifest V3 extension. All logic runs in a content script injected into `https://claude.ai/*`. Because the content script is same-origin with the page, `fetch` calls carry the existing session cookie automatically. There is no background service worker requirement for v1 beyond the manifest default.

```
tangent/
  manifest.json
  src/
    content/
      index.ts            entry, mounts the gutter root
      selection.ts        selection listener, Range capture, geometry
      highlight.ts        CSS Custom Highlight API wrapper
    gutter/
      Gutter.tsx          the right column, owns stacking
      Bubble.tsx          one thread: quote, messages, composer
      stack.ts            collision resolution, top offsets
    api/
      client.ts           THE ONLY FILE THAT TOUCHES THE NETWORK
      sse.ts              ReadableStream to event frames
      types.ts
    state/
      store.ts            bubbles, active bubble, usage
  styles/
    gutter.css
```

### 6.1 Layout

The claude.ai conversation column is centered with empty space to its right at wide viewports, but that space is not reserved and collapses on narrower windows.

Tangent injects CSS that shifts the conversation column left and claims a fixed 340px gutter on the right. Below a 1280px viewport width, the gutter collapses and bubbles open as a popover anchored to the selection instead. This threshold is a constant, not a magic number scattered through the CSS.

### 6.2 Highlighting

Use the **CSS Custom Highlight API** (`CSS.highlights.set()`), not `<span>` wrapping.

This is a hard requirement. React owns the message DOM and will discard injected nodes on re-render, which happens during streaming and on any state change in the host app. The Highlight API paints directly from a `Range` object without mutating the DOM, so there is nothing for React to clobber. Chrome 105+.

```ts
const highlight = new Highlight(range);
CSS.highlights.set(`tangent-${bubbleId}`, highlight);
```

Style via `::highlight(tangent-<id>)`. Active and inactive highlight states get different treatments.

### 6.3 Positioning and stacking

Each bubble wants to sit at `range.getBoundingClientRect().top`, relative to the gutter's coordinate space.

When two anchors are closer together than the height of the first bubble, the second is pushed down and draws a connector line back up to its own highlight. This is the Word behavior and it is not optional; without it, overlapping bubbles make the feature unusable in dense text.

`stack.ts` implements a single pass:

- Sort bubbles by desired top offset
- Walk in order, clamping each `top` to `max(desired, previousBottom + GAP)`
- Return resolved offsets; bubbles whose resolved top differs from desired render a connector

Recompute on scroll (throttled with `requestAnimationFrame`), on window resize, and when any bubble's height changes (`ResizeObserver`).

### 6.4 API client

Everything that touches the network lives in `api/client.ts` behind three functions:

```ts
createThread(title: string): Promise<ThreadId>
sendMessage(threadId: ThreadId, content: string): Promise<Response>
streamReply(response: Response, onDelta: (text: string) => void): Promise<string>
```

**These endpoints are internal app plumbing, not a public contract.** Request shapes, required headers, and the organization identifiers in the URL paths can change without notice. The point of this module is that a breaking change is one file to fix rather than a hunt through UI code. No `fetch` call may appear anywhere else in the codebase.

Request shapes should be derived by observing the network tab on claude.ai, not assumed from this document.

Responses arrive as server-sent events, not a single JSON body. `sse.ts` reads the `ReadableStream`, splits on double newlines, parses event frames, and yields text deltas. Build this properly on day one; retrofitting streaming into a component that expected one blob is painful.

### 6.5 Threads in the sidebar

Side threads are real conversations and appear in the user's claude.ai sidebar.

At forty bubbles a week, this competes with real conversations for sidebar space. Mitigations for v1:

- Auto-title as `Tangent: <first 40 chars of excerpt>`
- Bubble close prompts to archive the underlying thread, with a "don't ask again" preference

### 6.6 Rate limits

Side threads spend from the same session and weekly quota as the main conversation. The feature's entire premise is that tangents feel cheap, which is precisely how a session gets burned on trivia.

Two requirements:

- **Default side threads to a smaller, faster model.** A notch lookup does not need the top-tier model. Make the model selectable per bubble, with the default set in extension options.
- **Surface usage in the bubble.** Read the session percentage the host app already displays and show it in the composer footer so the cost stays visible.

## 7. Interaction spec

**Creating a tangent**

1. User selects text inside an assistant message. Selection inside user messages is also allowed.
2. A small "Ask Tangent" affordance appears near the selection end. It must not collide with Claude's own highlight-to-reply popup; offset it or suppress theirs while a modifier key is held. Decide during implementation which reads better.
3. Clicking it creates a bubble in the gutter at the selection's vertical position, applies the highlight, and focuses the composer.
4. User types a question and submits. The bubble shows the excerpt as a quote block, then the streaming answer.

**Within a bubble**

- Follow-up composer stays at the bottom of the bubble
- Bubble is collapsible to a single-line summary
- Close removes the bubble and clears its highlight
- Clicking a bubble scrolls its highlight into view; clicking a highlight focuses its bubble

**Empty and error states**

- No network: bubble shows a retry affordance, question text is preserved
- Rate limited: explicit message naming the limit, not a generic failure
- Auth expired: prompt to reload the page, since the session cookie is the page's

## 8. Milestones

**M1, gutter and selection, no network.** Selection listener, Highlight API rendering, gutter layout, stacking with connectors, bubbles containing hardcoded text. This validates the hardest UI work with zero API risk.

**M2, API client standalone.** `client.ts` and `sse.ts` exercised from the devtools console against a scratch thread. Streaming works, thread creation works, errors are typed. No UI involvement.

**M3, integration.** Wire M2 into M1. Real questions, real answers, per-bubble message arrays, follow-ups.

**M4, polish.** Auto-titling, archive-on-close, model selector, usage display, narrow viewport popover fallback, options page.

Build M1 and M2 in either order; they share no code. M2 carries all the unknowns.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Internal endpoints change | All network code isolated in `api/client.ts` |
| React re-render destroys highlights | CSS Custom Highlight API, no DOM mutation |
| Host app CSS changes break gutter layout | Layout constants in one file; degrade to popover mode if the column selector is not found |
| Terms of service ambiguity | Personal use, own session, own browser. Read Anthropic's usage policies before investing further. This is not a settled question and the answer is not obvious from the outside. |
| Side threads flood the sidebar | Auto-titling plus archive-on-close |
| Quota burned on trivia | Smaller default model, visible usage counter |

## 10. Deferred

**Session persistence.** If losing bubbles on reload becomes annoying, the cheap version is storing the exact quote string plus message index in `localStorage` and re-locating with `indexOf` on load. If the text is not found, the bubble silently does not render. Roughly twenty lines, no dependency, no change to anything else in the architecture. Full fuzzy anchoring is only worth it if that proves insufficient.

**Promote to main thread.** A button that posts a bubble's conclusion into the main conversation as context, for when a tangent turns out to matter. This is the capability Word comments lack and the strongest argument for the product existing, but it depends on M3 being solid first.

**Multi-select tangents.** One bubble covering several discontiguous highlights.