import { GUTTER_WIDTH, GUTTER_GAP, NARROW_VIEWPORT_THRESHOLD } from "@/config";
import { getHost } from "@/hosts/resolve";

/**
 * Owns the host-page layout mutation. (PRD 6.1)
 *
 * Bubbles always dock to the right free space. When the viewport is wide enough
 * we also shift the conversation column so content never sits under the gutter.
 * Below the threshold we still dock right — we just skip the column shift.
 */

export type LayoutMode = "gutter" | "overlay";

const STYLE_ID = "offthread-layout-style";

export interface LayoutState {
  mode: LayoutMode;
  gutterWidth: number;
}

type LayoutListener = (state: LayoutState) => void;

export class Layout {
  private listeners = new Set<LayoutListener>();
  private state: LayoutState = { mode: "overlay", gutterWidth: GUTTER_WIDTH };
  private resizeRaf = 0;

  start(): void {
    this.ensureStyleEl();
    window.addEventListener("resize", this.onResize, { passive: true });
    this.recompute();
  }

  stop(): void {
    window.removeEventListener("resize", this.onResize);
    document.getElementById(STYLE_ID)?.remove();
    document.documentElement.removeAttribute("data-offthread-mode");
  }

  getState(): LayoutState {
    return this.state;
  }

  subscribe(fn: LayoutListener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private onResize = (): void => {
    if (this.resizeRaf) return;
    this.resizeRaf = requestAnimationFrame(() => {
      this.resizeRaf = 0;
      this.recompute();
    });
  };

  private findColumn(): HTMLElement | null {
    for (const selector of getHost().columnSelectors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) return el;
    }
    return null;
  }

  private recompute(): void {
    const wideEnough = window.innerWidth >= NARROW_VIEWPORT_THRESHOLD;
    const column = this.findColumn();
    // Reserve space whenever we can; otherwise still right-dock without shifting.
    const mode: LayoutMode = wideEnough && column ? "gutter" : "overlay";

    this.applyMode(mode);

    if (mode !== this.state.mode) {
      this.state = { ...this.state, mode };
      this.emit();
    }
  }

  private applyMode(mode: LayoutMode): void {
    document.documentElement.setAttribute("data-offthread-mode", mode);
    const style = this.ensureStyleEl();
    const reserve = GUTTER_WIDTH + GUTTER_GAP * 2;
    if (mode === "gutter") {
      style.textContent = `
        :root { --offthread-gutter-width: ${GUTTER_WIDTH}px; }
        html[data-offthread-mode="gutter"] main {
          margin-right: ${reserve}px !important;
          transition: margin-right 160ms ease;
        }
      `;
    } else {
      // Soft reserve: prefer not overlapping the chat column when there's room.
      style.textContent = `
        :root { --offthread-gutter-width: ${GUTTER_WIDTH}px; }
      `;
    }
  }

  private ensureStyleEl(): HTMLStyleElement {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    return style;
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }
}
