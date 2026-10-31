/*
 * Ob der Max. Drawdown im Verlauf eingezeichnet ist. Die Drawdown-Karte schaltet ihn, der
 * Chart zeichnet ihn — zwei Komponenten ohne gemeinsamen Zustand. Nicht gespeichert: er gilt fuer diesen Blick, nicht fuer den naechsten Start.
 */

import { beobachtbar, useBeobachtet } from './beobachtbar';

const gezeigt = beobachtbar(false);

export function useDrawdownGezeigt(): boolean {
  return useBeobachtet(gezeigt);
}

export function setzeDrawdownGezeigt(an: boolean): void {
  gezeigt.setze(an);
}

export function schalteDrawdown(): void {
  gezeigt.setze(!gezeigt.lies());
}
