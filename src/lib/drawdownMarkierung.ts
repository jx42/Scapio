/*
 * Ob der Max. Drawdown im Verlauf eingezeichnet ist. Zwei Kacheln schalten ihn — die
 * Drawdown-Karte im Verlauf und die Zeile in den Kennzahlen —, also liegt er ausserhalb
 * beider. Nicht gespeichert: er gilt fuer diesen Blick, nicht fuer den naechsten Start.
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
