import { MIN_SELECTION_LENGTH, GUTTER_ROOT_ID } from "@/config";
import { getSurroundingContext } from "./context";

export interface SelectionCapture {
  /** Live Range (cloned) at the moment of capture. */
  range: Range;
  /** Verbatim highlighted text. */
  excerpt: string;
  /** Containing paragraph/block, to resolve references in the excerpt. */
  context: string;
  /** Viewport-space rect of the selection, for positioning. */
  rect: DOMRect;
}

type AskHandler = (capture: SelectionCapture) => void;

const REPLY_PROBE_MS = 1200;
const REPLY_PROBE_INTERVAL = 16;

/**
 * Watches for text selections and mounts "Ask Tangent" as a sibling to the
 * right of Claude's Reply control inside `[data-selection-tooltip]`.
 *
 * Stays hidden until Reply's tooltip is present so both appear together —
 * no early park + snap.
 */
export class SelectionWatcher {
  private button: HTMLButtonElement | null = null;
  private current: SelectionCapture | null = null;
  private onAsk: AskHandler;
  private probeTimer: number | null = null;
  private replyObserver: MutationObserver | null = null;

  constructor(onAsk: AskHandler) {
    this.onAsk = onAsk;
  }

  start(): void {
    document.addEventListener("mouseup", this.handleMouseUp, true);
    document.addEventListener("mousedown", this.handleMouseDown, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
    document.addEventListener("scroll", this.hide, true);
  }

  stop(): void {
    document.removeEventListener("mouseup", this.handleMouseUp, true);
    document.removeEventListener("mousedown", this.handleMouseDown, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
    document.removeEventListener("scroll", this.hide, true);
    this.stopProbing();
    this.removeButton();
  }

  private handleMouseDown = (e: MouseEvent): void => {
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (this.button?.contains(t)) return;
    // Clicks inside Claude's selection tooltip (Reply) shouldn't kill the probe
    // before our button has a chance to mount beside it.
    if (t instanceof Element && t.closest("[data-selection-tooltip]")) return;
    this.hide();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") this.hide();
  };

  private handleMouseUp = (): void => {
    window.setTimeout(() => this.evaluateSelection(), 0);
  };

  private evaluateSelection(): void {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      this.hide();
      return;
    }

    const text = sel.toString().trim();
    if (text.length < MIN_SELECTION_LENGTH) {
      this.hide();
      return;
    }

    const range = sel.getRangeAt(0);
    if (!this.isSelectableTarget(range)) {
      this.hide();
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      this.hide();
      return;
    }

    this.current = {
      range: range.cloneRange(),
      excerpt: text,
      context: getSurroundingContext(range, text),
      rect
    };
    this.ensureButton();
    // Keep hidden until Reply's tooltip mounts — then show together.
    this.hideButtonVisual();
    this.startProbing();
  }

  private isSelectableTarget(range: Range): boolean {
    const container =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;
    if (!container) return false;

    const gutter = document.getElementById(GUTTER_ROOT_ID);
    if (gutter && gutter.contains(container)) return false;

    const main = document.querySelector("main");
    if (main && !main.contains(container)) return false;

    return true;
  }

  private ensureButton(): void {
    if (this.button) return;
    const btn = document.createElement("button");
    btn.id = "tangent-ask-affordance";
    btn.type = "button";
    // Label + Lucide line-squiggle, mirroring Reply's text+icon layout.
    btn.innerHTML = `
      <span>Ask Tangent</span>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
           stroke-linejoin="round" aria-hidden="true" class="tg-ask-icon">
        <path d="M7 3.5c5-2 7 2.5 3 4C1.5 10 2 15 5 16c5 2 9-10 14-7s.5 13.5-4 12c-5-2.5.5-11 6-2"></path>
      </svg>
    `.trim();
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", this.handleAskClick);
    document.body.appendChild(btn);
    this.button = btn;
  }

  /** True when Claude's Reply control is in the selection tooltip. */
  private findReplyRow(): HTMLElement | null {
    const tooltip = document.querySelector<HTMLElement>("[data-selection-tooltip='true']");
    if (!tooltip) return null;

    const row =
      tooltip.querySelector<HTMLElement>(":scope > div.flex") ??
      tooltip.querySelector<HTMLElement>("div.flex.items-center");
    if (!row) return null;

    const hasReply = Array.from(row.querySelectorAll("button, [role='button']")).some((el) =>
      /^Reply\b/i.test((el.textContent || "").replace(/\s+/g, " ").trim())
    );
    return hasReply ? row : null;
  }

  /**
   * Mount into the Reply tooltip and reveal. Returns false while Reply isn't
   * ready yet — caller keeps probing without showing a premature fallback.
   */
  private tryMountWithReply(): boolean {
    if (!this.button) return false;
    const row = this.findReplyRow();
    if (!row) return false;

    if (this.button.parentElement !== row || row.lastElementChild !== this.button) {
      row.appendChild(this.button);
    }

    this.button.dataset.mounted = "tooltip";
    this.button.style.top = "";
    this.button.style.left = "";
    this.button.setAttribute("data-visible", "true");
    return true;
  }

  /** Last-resort: show fixed if Reply never appears (Claude UI change / lag). */
  private showFixedFallback(selectionRect: DOMRect): void {
    if (!this.button) return;
    this.button.dataset.mounted = "fixed";
    if (this.button.parentElement !== document.body) {
      document.body.appendChild(this.button);
    }
    const top = Math.max(8, selectionRect.top - 40);
    const left = Math.min(
      Math.max(8, selectionRect.left + selectionRect.width / 2 + 40),
      window.innerWidth - 160
    );
    this.button.style.top = `${top}px`;
    this.button.style.left = `${left}px`;
    this.button.setAttribute("data-visible", "true");
  }

  private startProbing(): void {
    this.stopProbing();
    const started = performance.now();
    const selectionRect = this.current?.rect;
    if (!selectionRect) return;

    const attempt = () => {
      if (this.tryMountWithReply()) {
        this.stopProbing();
        return true;
      }
      return false;
    };

    // Sync attempt in case Reply is already there.
    if (attempt()) return;

    this.replyObserver = new MutationObserver(() => {
      attempt();
    });
    this.replyObserver.observe(document.body, { childList: true, subtree: true });

    const tick = () => {
      if (attempt()) return;
      if (performance.now() - started >= REPLY_PROBE_MS) {
        this.stopProbing();
        // Only if we still have a live selection capture.
        if (this.current) this.showFixedFallback(selectionRect);
        return;
      }
      this.probeTimer = window.setTimeout(tick, REPLY_PROBE_INTERVAL);
    };
    this.probeTimer = window.setTimeout(tick, REPLY_PROBE_INTERVAL);
  }

  private stopProbing(): void {
    if (this.probeTimer != null) {
      window.clearTimeout(this.probeTimer);
      this.probeTimer = null;
    }
    this.replyObserver?.disconnect();
    this.replyObserver = null;
  }

  private hideButtonVisual(): void {
    if (!this.button) return;
    this.button.removeAttribute("data-visible");
    this.button.removeAttribute("data-mounted");
    this.button.style.top = "";
    this.button.style.left = "";
    if (this.button.parentElement !== document.body) {
      document.body.appendChild(this.button);
    }
  }

  private handleAskClick = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (this.current) this.onAsk(this.current);
    this.hide();
  };

  private hide = (): void => {
    this.current = null;
    this.stopProbing();
    this.hideButtonVisual();
  };

  private removeButton(): void {
    this.button?.remove();
    this.button = null;
  }
}
