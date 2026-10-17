/*
 * Ob eine Media Query gerade zutrifft, laufend aktualisiert.
 *
 * App.tsx bindet die Hoehen von Aufteilung und Kennzahlen nur, solange beide
 * nebeneinander stehen — untereinander waere die geliehene Hoehe nur Leerraum.
 */
import { useSyncExternalStore } from 'react';

export function useMedienAbfrage(abfrage: string): boolean {
  return useSyncExternalStore(
    (melden) => {
      const liste = window.matchMedia(abfrage);
      liste.addEventListener('change', melden);
      return () => liste.removeEventListener('change', melden);
    },
    () => window.matchMedia(abfrage).matches,
    () => false,
  );
}
