/*
 * Kleine Auswahlzustaende, die ein Neuladen ueberleben sollen: der gewaehlte Zeitraum
 * der Verlaufskachel, die Ansicht, das Fenster der Flusskachel, „Mehr zeigen“. [P-06]
 *
 * Was hier NICHT hineingehoert: das Session-Token. Es steht ausschliesslich im <meta>
 * der ausgelieferten Seite — siehe `lib/token.ts`, dort steht auch warum.
 *
 * Jeder Zugriff ist gekapselt: in einem privaten Fenster wirft localStorage, und daran
 * darf die Seite nicht scheitern. Gelesen wird nur, was in der Erlaubnisliste steht —
 * ein manipulierter Eintrag darf keine unbekannte Zeitraumkennung in eine URL tragen.
 */

import { useCallback, useState } from 'react';

const PRAEFIX = 'portfolio.';

function lesen<T extends string>(name: string, erlaubt: readonly T[]): T | null {
  try {
    const roh = window.localStorage.getItem(PRAEFIX + name);
    return roh !== null && (erlaubt as readonly string[]).includes(roh) ? (roh as T) : null;
  } catch {
    return null;
  }
}

function schreiben(name: string, wert: string): void {
  try {
    window.localStorage.setItem(PRAEFIX + name, wert);
  } catch {
    // Kein Speicher verfuegbar: die Auswahl gilt dann nur fuer diese Sitzung.
  }
}

export function useGespeichert<T extends string>(
  name: string,
  vorgabe: T,
  erlaubt: readonly T[],
): [T, (wert: T) => void] {
  const [wert, setWert] = useState<T>(() => lesen<T>(name, erlaubt) ?? vorgabe);

  const setzen = useCallback(
    (neu: T) => {
      setWert(neu);
      schreiben(name, neu);
    },
    [name],
  );

  return [wert, setzen];
}

export const AN_AUS = ['aus', 'an'] as const;
export type AnAus = (typeof AN_AUS)[number];

/** Ein gespeicherter Schalter; im Speicher als `an`/`aus`, weil `useGespeichert` nur Zeichenketten kennt. */
export function useGespeicherterSchalter(name: string, vorgabe: boolean): [boolean, (wert: boolean) => void] {
  const [wert, setzen] = useGespeichert<AnAus>(name, vorgabe ? 'an' : 'aus', AN_AUS);
  const schalten = useCallback((neu: boolean) => setzen(neu ? 'an' : 'aus'), [setzen]);
  return [wert === 'an', schalten];
}

/**
 * Weggeklickte Lauf-Hinweise, gemerkt fuer genau einen Lauf: der naechste bringt seine
 * Hinweise neu. Die Schluessel werden nur verglichen, nie angezeigt oder in eine URL gesetzt.
 */
export function useAusgeblendet(laufId: number | null): [ReadonlySet<string>, (schluessel: string) => void] {
  const [stand, setStand] = useState(() => ausgeblendetLesen());
  const aktuell = laufId !== null && stand.laufId === laufId ? stand.schluessel : LEER;

  const ausblenden = useCallback(
    (schluessel: string) => {
      if (laufId === null) return;
      const neu = { laufId, schluessel: new Set(aktuell).add(schluessel) };
      setStand(neu);
      schreiben(AUSGEBLENDET, JSON.stringify({ laufId, schluessel: [...neu.schluessel] }));
    },
    [laufId, aktuell],
  );

  return [aktuell, ausblenden];
}

const AUSGEBLENDET = 'ausgeblendet';
const LEER: ReadonlySet<string> = new Set();

function ausgeblendetLesen(): { laufId: number | null; schluessel: ReadonlySet<string> } {
  try {
    const roh: unknown = JSON.parse(window.localStorage.getItem(PRAEFIX + AUSGEBLENDET) ?? 'null');
    if (typeof roh === 'object' && roh !== null && 'laufId' in roh && 'schluessel' in roh) {
      const { laufId, schluessel } = roh;
      if (typeof laufId === 'number' && Array.isArray(schluessel)) {
        return { laufId, schluessel: new Set(schluessel.filter((s): s is string => typeof s === 'string')) };
      }
    }
  } catch {
    // Kaputter oder gesperrter Speicher: nichts ausgeblendet.
  }
  return { laufId: null, schluessel: LEER };
}
