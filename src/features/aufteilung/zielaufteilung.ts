/*
 * Eingabeseite des Rebalancing-Rechners: Felder lesen, die Summe pruefen, das Ziel als
 * Query bauen und im Browser merken. Gerechnet wird auf dem Server [ADR-057]; was hier
 * steht, ist Eingabepruefung in ganzen Basispunkten, keine Finanzrechnung.
 */

import { ISIN_MUSTER } from '@/lib/onvista';
import { jsonLesen, jsonSchreiben } from '@/lib/speicher';

export const KONTO = 'KONTO';
export const BP_GANZ = 10_000;
/** Mehr Zeilen nimmt die Route nicht an. */
export const HOECHSTENS_ZEILEN = 50;
/** Eine Nachkommastelle in Prozent: die Felder kennen nur Vielfache von 10 Basispunkten. */
const SCHRITT = 10;

/** "12,5" wird zu 1250; ein leeres Feld zaehlt als 0; alles andere ist `null`. */
export function bpAusEingabe(text: string): number | null {
  const t = text.trim();
  if (t === '') return 0;
  const treffer = /^(\d{1,3})(?:[,.](\d))?$/.exec(t);
  if (treffer === null) return null;
  const bp = Number(treffer[1]) * 100 + Number(treffer[2] ?? '0') * SCHRITT;
  return bp <= BP_GANZ ? bp : null;
}

export function zielParameter(ziel: ReadonlyArray<readonly [string, number]>): string {
  return ziel.map(([schluessel, bp]) => `${schluessel}:${String(bp)}`).join(',');
}

export function istIsin(text: string): boolean {
  return ISIN_MUSTER.test(text);
}

/** Das Gegenstueck zu `zielParameter`, fuer das feste Beispielziel des Demo-Abzugs. */
export function zielAusParameter(parameter: string): Map<string, number> {
  const ziel = new Map<string, number>();
  for (const eintrag of parameter.split(',')) {
    const [schluessel = '', bp = ''] = eintrag.split(':');
    if (/^\d{1,5}$/.test(bp)) ziel.set(schluessel, Number(bp));
  }
  return ziel;
}

/* --------------------------------------------------------------------- Speicher */

const NAME = 'zielaufteilung';

export type GespeichertesZiel = {
  readonly ziel: ReadonlyMap<string, number>;
  /** Zeilen, die nicht in die Rechnung eingehen; ihr Ziel bleibt fuer spaeter stehen. */
  readonly ausgeschlossen: readonly string[];
};

const LEER: GespeichertesZiel = { ziel: new Map(), ausgeschlossen: [] };

const gueltigerSchluessel = (s: unknown): s is string => typeof s === 'string' && (s === KONTO || istIsin(s));
const gueltigeBp = (bp: unknown): bp is number => Number.isInteger(bp) && (bp as number) >= 0 && (bp as number) <= BP_GANZ;

/** Ein manipulierter oder veralteter Eintrag faellt Zeile fuer Zeile heraus, nie die Seite. */
export function zielLesen(): GespeichertesZiel {
  const roh = jsonLesen(NAME);
  if (typeof roh !== 'object' || roh === null) return LEER;
  const { ziel, ausgeschlossen } = roh as Record<string, unknown>;
  const eintraege =
    typeof ziel === 'object' && ziel !== null
      ? Object.entries(ziel).filter(([s, bp]) => gueltigerSchluessel(s) && gueltigeBp(bp)).slice(0, HOECHSTENS_ZEILEN)
      : [];
  return {
    ziel: new Map(eintraege as [string, number][]),
    ausgeschlossen: Array.isArray(ausgeschlossen) ? ausgeschlossen.filter(gueltigerSchluessel).slice(0, HOECHSTENS_ZEILEN) : [],
  };
}

export function zielSchreiben(z: GespeichertesZiel): void {
  jsonSchreiben(NAME, { ziel: Object.fromEntries(z.ziel), ausgeschlossen: z.ausgeschlossen });
}
