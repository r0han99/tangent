import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "@/state/store";
import { Bubble } from "./Bubble";
import { resolveStack, type StackInput } from "./stack";
import { GUTTER_WIDTH, GUTTER_ROOT_ID } from "@/config";
import { getGutterLeft } from "@/content/contentAnchor";
import { getRange } from "@/content/highlight";
import type { Layout } from "@/content/layout";

const ESTIMATED_HEIGHT = 120;

/**
 * Margin column docked just to the right of the chat text.
 *
 * Vertical position is re-measured from each bubble's live Range on every
 * scroll — including nested scroll containers (claude.ai does not scroll the
 * window). That keeps the panel locked to its highlight.
 */
export function Gutter({ layout }: { layout: Layout }) {
  const bubbles = useStore((s) => s.bubbles);
  const activeId = useStore((s) => s.activeId);
  const collapseIdleBubbles = useStore((s) => s.collapseIdleBubbles);

  const [gutterLeft, setGutterLeft] = useState(() => getGutterLeft());
  /** Viewport-space top for each bubble, from the live highlight Range. */
  const [viewportTops, setViewportTops] = useState<Record<string, number>>({});
  const [heights, setHeights] = useState<Record<string, number>>({});

  const elements = useRef(new Map<string, HTMLDivElement>());
  const roRef = useRef<ResizeObserver | null>(null);

  useEffect(() => layout.subscribe(() => {}), [layout]);

  const recomputeGeometry = useCallback(() => {
    const list = useStore.getState().bubbles;
    const tops: Record<string, number> = {};
    for (const b of list) {
      const range = getRange(b.id);
      if (range) {
        tops[b.id] = range.getBoundingClientRect().top;
      } else {
        // Fallback if the Range drifted; keep last known document offset.
        tops[b.id] = b.desiredTop - window.scrollY;
      }
    }
    setViewportTops(tops);

    const first = list[0];
    const anchor = first ? getRange(first.id) : null;
    setGutterLeft(getGutterLeft(anchor));
  }, []);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        recomputeGeometry();
      });
    };

    // capture:true catches scroll on nested containers (claude.ai's chat pane).
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule, { passive: true });

    // Also attach directly to known scroll parents of the first highlight.
    const attached: Element[] = [];
    const first = useStore.getState().bubbles[0];
    const range = first ? getRange(first.id) : null;
    const start =
      range?.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range?.commonAncestorContainer.parentElement;
    let el: Element | null = start ?? null;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      const oy = style.overflowY;
      if (oy === "auto" || oy === "scroll" || oy === "overlay") {
        el.addEventListener("scroll", schedule, { passive: true });
        attached.push(el);
      }
      el = el.parentElement;
    }

    schedule();

    return () => {
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      for (const node of attached) node.removeEventListener("scroll", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [bubbles, recomputeGeometry]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const root = document.getElementById(GUTTER_ROOT_ID);
      if (root?.contains(target)) return;
      if ((target as Element).closest?.("#tangent-ask-affordance")) return;
      if ((target as Element).closest?.("[data-selection-tooltip]")) return;
      collapseIdleBubbles();
    };
    document.addEventListener("mousedown", onPointerDown, true);
    return () => document.removeEventListener("mousedown", onPointerDown, true);
  }, [collapseIdleBubbles]);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      setHeights((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.bubbleId;
          if (!id) continue;
          const h = entry.contentRect.height;
          if (Math.abs((prev[id] ?? 0) - h) > 0.5) {
            next[id] = h;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    roRef.current = ro;
    return () => ro.disconnect();
  }, []);

  const registerEl = useCallback((id: string, el: HTMLDivElement | null) => {
    const ro = roRef.current;
    const existing = elements.current.get(id);
    if (existing && existing !== el) ro?.unobserve(existing);
    if (el) {
      el.dataset.bubbleId = id;
      elements.current.set(id, el);
      ro?.observe(el);
    } else {
      elements.current.delete(id);
    }
  }, []);

  useLayoutEffect(() => {
    const ids = new Set(bubbles.map((b) => b.id));
    setHeights((prev) => {
      const next: Record<string, number> = {};
      let changed = false;
      for (const [id, h] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = h;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [bubbles]);

  if (bubbles.length === 0) return null;

  const inputs: StackInput[] = bubbles.map((b) => ({
    id: b.id,
    desiredTop: viewportTops[b.id] ?? b.desiredTop - window.scrollY,
    height: heights[b.id] ?? ESTIMATED_HEIGHT
  }));
  const resolved = resolveStack(inputs);
  const byId = new Map(resolved.map((r) => [r.id, r]));

  return (
    <div
      className="tg-gutter"
      style={{
        width: `${GUTTER_WIDTH}px`,
        left: `${gutterLeft}px`
      }}
    >
      {bubbles.map((b) => {
        const r = byId.get(b.id);
        if (!r) return null;
        const desiredViewportTop = viewportTops[b.id] ?? r.desiredTop;
        return (
          <div key={b.id}>
            {r.displaced && (
              <Connector desiredTop={desiredViewportTop} resolvedTop={r.top} />
            )}
            <div
              className="tg-bubble-wrap"
              style={{
                top: `${r.top}px`,
                width: `${GUTTER_WIDTH}px`,
                zIndex: b.id === activeId ? 2 : 1
              }}
              ref={(el) => registerEl(b.id, el)}
            >
              <Bubble bubble={b} active={b.id === activeId} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Connector({ desiredTop, resolvedTop }: { desiredTop: number; resolvedTop: number }) {
  const top = Math.min(desiredTop, resolvedTop);
  const height = Math.abs(resolvedTop - desiredTop);
  return (
    <div
      className="tg-connector"
      style={{ top: `${top}px`, height: `${height}px` }}
      aria-hidden
    />
  );
}
