// Gemeinsame Vorbereitung aller Suites.
// Kein globaler Zustand ausser dem, was Testing Library braucht.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');

  // jsdom layoutet nicht: jedes Element misst 0x0. Recharts' ResponsiveContainer
  // haengt daran und zeichnet entweder nichts oder meldet "width(0) and height(0)",
  // Radix' Popper (hinter jedem Tooltip) verlangt ausserdem einen ResizeObserver.
  // Beides wird hier mit einer festen, plausiblen Flaeche bedient — sonst rauscht
  // jeder Kachel-Test die Warnung mit und der Zustand faellt ausserhalb von act().
  const BREITE = 800;
  const HOEHE = 400;

  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      readonly #rueckruf: ResizeObserverCallback;

      constructor(rueckruf: ResizeObserverCallback) {
        this.#rueckruf = rueckruf;
      }

      // Synchron melden, solange der Effekt noch in act() laeuft: dann verbucht
      // React die Zustandsaenderung im selben Durchlauf statt danach.
      observe(ziel: Element) {
        this.#rueckruf(
          [{ target: ziel, contentRect: { width: BREITE, height: HOEHE } } as ResizeObserverEntry],
          this,
        );
      }

      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

  // Der Rueckfallweg, wenn Recharts direkt misst statt den Observer abzuwarten.
  HTMLElement.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      width: BREITE,
      height: HOEHE,
      top: 0,
      left: 0,
      right: BREITE,
      bottom: HOEHE,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
}

export {};
