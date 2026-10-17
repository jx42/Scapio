/*
 * Ein Wert, bei dessen Aenderung nur rendert, wer ihn liest — nicht der Baum darueber.
 * Fuer Zustand, der in schneller Folge wechselt (Reglergriffe beim Ziehen), waehrend
 * daneben ein teurer Baum (ein Chart) stillhalten soll.
 */

import { useSyncExternalStore } from 'react';

export type Beobachtbar<T> = {
  readonly lies: () => T;
  readonly setze: (wert: T) => void;
  readonly abonniere: (hoerer: () => void) => () => void;
};

export function beobachtbar<T>(anfang: T): Beobachtbar<T> {
  let wert = anfang;
  const hoerer = new Set<() => void>();
  return {
    lies: () => wert,
    setze: (neu) => {
      if (Object.is(neu, wert)) return;
      wert = neu;
      for (const h of hoerer) h();
    },
    abonniere: (h) => {
      hoerer.add(h);
      return () => {
        hoerer.delete(h);
      };
    },
  };
}

export function useBeobachtet<T>(quelle: Beobachtbar<T>): T {
  return useSyncExternalStore(quelle.abonniere, quelle.lies, quelle.lies);
}
