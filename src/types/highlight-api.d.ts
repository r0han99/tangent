/**
 * Minimal ambient types for the CSS Custom Highlight API (Chrome 105+).
 * TypeScript's bundled DOM lib does not yet ship these, and the API is a
 * hard requirement for Tangent (PRD 6.2), so we declare what we use.
 */

interface Highlight {
  readonly size: number;
  add(range: AbstractRange): void;
  clear(): void;
  delete(range: AbstractRange): boolean;
  has(range: AbstractRange): boolean;
  forEach(cb: (range: AbstractRange) => void): void;
}

declare var Highlight: {
  prototype: Highlight;
  new (...ranges: AbstractRange[]): Highlight;
};

interface HighlightRegistry {
  set(name: string, highlight: Highlight): HighlightRegistry;
  get(name: string): Highlight | undefined;
  has(name: string): boolean;
  delete(name: string): boolean;
  clear(): void;
}

interface CSS {
  highlights: HighlightRegistry;
}

interface Window {
  CSS: CSS & typeof globalThis.CSS;
}
