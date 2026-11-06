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

/*
 * Im Speicher steht je Zeile nur eine FNV-1a-Pruefsumme des Schluessels, keine ISIN — wie bei
 * den weggeklickten Hinweisen [ADR-056]. Zurueckgefunden wird eine Zeile ueber die Schluessel,
 * die der Dialog gerade zeigt. Fassung 1 (bis 2026-11) hielt die ISINs im Klartext und wird
 * beim ersten Lesen umgeschrieben.
 */

const NAME = 'zielaufteilung';
const FASSUNG = 2;

export type GespeichertesZiel = {
  readonly ziel: ReadonlyMap<string, number>;
  /** Zeilen, die nicht in die Rechnung eingehen; ihr Ziel bleibt fuer spaeter stehen. */
  readonly ausgeschlossen: readonly string[];
};

const LEER: GespeichertesZiel = { ziel: new Map(), ausgeschlossen: [] };

export function zielPruefsumme(schluessel: string): string {
  let summe = 0x811c9dc5;
  for (const zeichen of schluessel) summe = Math.imul(summe ^ (zeichen.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  return summe.toString(36);
}

const istKlartext = (s: unknown): s is string => typeof s === 'string' && (s === KONTO || istIsin(s));
const istPruefsumme = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-z]{1,7}$/.test(s);
const gueltigeBp = (bp: unknown): bp is number => Number.isInteger(bp) && (bp as number) >= 0 && (bp as number) <= BP_GANZ;

/** Ein manipulierter oder veralteter Eintrag faellt Zeile fuer Zeile heraus, nie die Seite. */
function speicherLesen(): GespeichertesZiel {
  const roh = jsonLesen(NAME);
  if (typeof roh !== 'object' || roh === null) return LEER;
  const { fassung, ziel, ausgeschlossen } = roh as Record<string, unknown>;
  const alt = fassung !== FASSUNG;
  const gueltig = alt ? istKlartext : istPruefsumme;
  const umschreiben = (s: string): string => (alt ? zielPruefsumme(s) : s);
  const eintraege =
    typeof ziel === 'object' && ziel !== null
      ? Object.entries(ziel).filter(([s, bp]) => gueltig(s) && gueltigeBp(bp)).slice(0, HOECHSTENS_ZEILEN)
      : [];
  const gelesen: GespeichertesZiel = {
    ziel: new Map(eintraege.map(([s, bp]) => [umschreiben(s), bp as number])),
    ausgeschlossen: Array.isArray(ausgeschlossen) ? ausgeschlossen.filter(gueltig).slice(0, HOECHSTENS_ZEILEN).map(umschreiben) : [],
  };
  if (alt) speicherSchreiben(gelesen);
  return gelesen;
}

function speicherSchreiben(z: GespeichertesZiel): void {
  jsonSchreiben(NAME, { fassung: FASSUNG, ziel: Object.fromEntries(z.ziel), ausgeschlossen: z.ausgeschlossen });
}

/** Ersetzt einen Eintrag der Fassung 1 schon beim Laden der Seite, nicht erst beim Oeffnen des Dialogs. */
export function zielSpeicherUmstellen(): void {
  speicherLesen();
}

/** Das gemerkte Ziel der Zeilen, die es noch gibt; eine verkaufte Position faellt heraus. */
export function zielLesen(vorhanden: readonly string[]): GespeichertesZiel {
  const nachSumme = new Map(vorhanden.map((s) => [zielPruefsumme(s), s]));
  const gespeichert = speicherLesen();
  const ziel = new Map<string, number>();
  for (const [summe, bp] of gespeichert.ziel) {
    const schluessel = nachSumme.get(summe);
    if (schluessel !== undefined) ziel.set(schluessel, bp);
  }
  return {
    ziel,
    ausgeschlossen: gespeichert.ausgeschlossen.flatMap((summe) => nachSumme.get(summe) ?? []),
  };
}

export function zielSchreiben(z: GespeichertesZiel): void {
  speicherSchreiben({
    ziel: new Map([...z.ziel].map(([s, bp]) => [zielPruefsumme(s), bp])),
    ausgeschlossen: z.ausgeschlossen.map(zielPruefsumme),
  });
}
