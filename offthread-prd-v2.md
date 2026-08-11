# Offthread

**Product Requirements Document, v2**

Offthread is the v2 name and multi-vendor generalization of Tangent.

## Summary

Highlight text in Claude, ChatGPT, or Gemini. A bubble opens in the margin.
Ask a short question about that excerpt. The main conversation is never touched.

## Hosts

- `https://claude.ai/*`
- `https://chatgpt.com/*` and `https://chat.openai.com/*`
- `https://gemini.google.com/*`

Each host is an adapter in `src/hosts/<vendor>/` (DOM + session API). Shared UI
lives in `src/gutter/` and `src/state/`.

## Chrome Web Store

Same published item: `ieekphhmaohoodalgaboiolcmmpoagmi`. Version `2.0.0`.

## GitHub

Repo rename to `r0han99/offthread` is the last step after the store update
is live. Until then, Pages remain at `https://r0han99.github.io/tangent/`.
