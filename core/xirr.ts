/**
 * Interner Zinsfuss unregelmaessiger Zahlungen.
 *
 * Geloest wird  Summe( CF_i / (1+r)^((d_i - d_0)/365) ) = 0
 * per Newton-Raphson ab 0,1. Divergiert das Verfahren — bei mehreren Vorzeichenwechseln
 * durchaus moeglich — faellt es auf Bisektion ueber [-0,9999; 10] zurueck, die
 * garantiert konvergiert.
 *
 * Kein `NaN` verlaesst diese Funktion. Kein Vorzeichenwechsel ergibt ein eigenes
 * Ergebnis, keine Ausnahme. [core/CLAUDE.md]
 *
 * Wechselt das Vorzeichen mehrfach, kann es mehrere Loesungen geben; gemeldet wird eine,
 * mit `mehrdeutig`. Liegt die Loesung ausserhalb von [UNTERGRENZE; OBERGRENZE], heisst
 * das Ergebnis `ausserhalb_bereich`, nicht `nicht_konvergiert`. [ADR-043]
 *
 * Der Solver rechnet in `number` — er loest eine Gleichung, er verwahrt kein Geld.
 * Seine Eingaben sind exakt, sein Ergebnis ist ein Prozentsatz. Das ist unkritisch
 * und steht hier, damit es niemand spaeter "korrigiert". [P-08]
 */

import type { Tag } from './kalender.ts';
import { tageZwischen, vergleiche } from './kalender.ts';
import type { Fluss } from './typen.ts';

export type XirrErgebnis =
  | { readonly art: 'ok'; readonly rate: number; readonly iterationen: number; readonly mehrdeutig: boolean }
  | { readonly art: 'kein_vorzeichenwechsel' }
  | { readonly art: 'nicht_konvergiert' }
  | { readonly art: 'ausserhalb_bereich' }
  /** Alle Zahlungen an einem Tag: ohne Zeitraum gibt es keinen Zins. */
  | { readonly art: 'nicht_bestimmbar' }
  | { readonly art: 'zu_wenige_fluesse' };

type Loesung = XirrErgebnis | { readonly art: 'ok'; readonly rate: number; readonly iterationen: number };

export const START_RATE = 0.1;
export const NEWTON_SCHRITTE = 100;
export const BISEKTION_SCHRITTE = 200;
export const GENAUIGKEIT = 1e-9;
export const UNTERGRENZE = -0.9999;
export const OBERGRENZE = 10;

/** Tageszaehlung fest auf 365 — kein Act/Act, keine Schaltjahrkorrektur. */
export const TAGE_IM_JAHR = 365;

type Punkt = { readonly jahre: number; readonly betrag: number };

function vorbereiten(fluesse: readonly Fluss[]): Punkt[] {
  const sortiert = [...fluesse].sort((a, b) => vergleiche(a.tag, b.tag));
  const anfang = sortiert[0];
  if (anfang === undefined) return [];
  return sortiert.map((f) => ({
    jahre: tageZwischen(anfang.tag, f.tag) / TAGE_IM_JAHR,
    betrag: Number(f.betrag),
  }));
}

/** Barwert der Zahlungsreihe bei Zinssatz r. */
function barwert(punkte: readonly Punkt[], r: number): number {
  const basis = 1 + r;
  let summe = 0;
  for (const p of punkte) summe += p.betrag / Math.pow(basis, p.jahre);
  return summe;
}

/** Ableitung des Barwerts nach r. */
function ableitung(punkte: readonly Punkt[], r: number): number {
  const basis = 1 + r;
  let summe = 0;
  for (const p of punkte) {
    if (p.jahre === 0) continue;
    summe -= (p.betrag * p.jahre) / Math.pow(basis, p.jahre + 1);
  }
  return summe;
}

function vorzeichenwechsel(betraege: readonly number[]): number {
  let wechsel = 0;
  let letztes = 0;
  for (const b of betraege) {
    const v = Math.sign(b);
    if (v === 0) continue;
    if (letztes !== 0 && v !== letztes) wechsel += 1;
    letztes = v;
  }
  return wechsel;
}

/**
 * Kann es mehr als eine Loesung geben? Nur bei mehreren Vorzeichenwechseln der Zahlungen
 * (Descartes) — und auch dann nicht, wenn die aufgelaufene Summe nur einmal wechselt
 * (Norstrom). Ein Sparplan mit gelegentlicher Entnahme bleibt so eindeutig.
 */
function istMehrdeutig(punkte: readonly Punkt[]): boolean {
  if (vorzeichenwechsel(punkte.map((p) => p.betrag)) <= 1) return false;
  let summe = 0;
  const kumuliert = punkte.map((p) => (summe += p.betrag));
  return vorzeichenwechsel(kumuliert) !== 1 || summe === 0;
}

/**
 * Bisektion ueber [UNTERGRENZE; OBERGRENZE]. Greift, wenn Newton-Raphson divergiert
 * oder das Intervall verlaesst. Sie konvergiert langsam, aber sie konvergiert.
 */
function bisektion(punkte: readonly Punkt[]): Loesung {
  let unten = UNTERGRENZE;
  let oben = OBERGRENZE;
  let fUnten = barwert(punkte, unten);
  const fOben = barwert(punkte, oben);

  if (!Number.isFinite(fUnten) || !Number.isFinite(fOben)) return { art: 'nicht_konvergiert' };
  if (fUnten === 0) return { art: 'ok', rate: unten, iterationen: 0 };
  if (fOben === 0) return { art: 'ok', rate: oben, iterationen: 0 };
  if (fUnten > 0 === fOben > 0) return { art: 'ausserhalb_bereich' };

  for (let i = 1; i <= BISEKTION_SCHRITTE; i += 1) {
    const mitte = (unten + oben) / 2;
    const fMitte = barwert(punkte, mitte);
    if (!Number.isFinite(fMitte)) return { art: 'nicht_konvergiert' };

    if (Math.abs(fMitte) < GENAUIGKEIT || oben - unten < 1e-12) {
      return { art: 'ok', rate: mitte, iterationen: i };
    }

    if (fMitte > 0 === fUnten > 0) {
      unten = mitte;
      fUnten = fMitte;
    } else {
      oben = mitte;
    }
  }

  const mitte = (unten + oben) / 2;
  return Number.isFinite(mitte) ? { art: 'ok', rate: mitte, iterationen: BISEKTION_SCHRITTE } : { art: 'nicht_konvergiert' };
}

export function xirr(fluesse: readonly Fluss[], _heute?: Tag): XirrErgebnis {
  const punkte = vorbereiten(fluesse);
  if (punkte.length < 2) return { art: 'zu_wenige_fluesse' };
  if (vorzeichenwechsel(punkte.map((p) => p.betrag)) === 0) return { art: 'kein_vorzeichenwechsel' };
  if (punkte[punkte.length - 1]!.jahre === 0) return { art: 'nicht_bestimmbar' };

  const loesung = loese(punkte);
  return loesung.art === 'ok' ? { ...loesung, mehrdeutig: istMehrdeutig(punkte) } : loesung;
}

function loese(punkte: readonly Punkt[]): Loesung {
  let r = START_RATE;

  for (let i = 1; i <= NEWTON_SCHRITTE; i += 1) {
    const f = barwert(punkte, r);
    if (!Number.isFinite(f)) break;
    if (Math.abs(f) < GENAUIGKEIT) return { art: 'ok', rate: r, iterationen: i };

    const abl = ableitung(punkte, r);
    if (!Number.isFinite(abl) || abl === 0) break;

    const naechste = r - f / abl;
    if (!Number.isFinite(naechste) || naechste <= UNTERGRENZE || naechste > OBERGRENZE) break;
    if (Math.abs(naechste - r) < 1e-15) return { art: 'ok', rate: naechste, iterationen: i };

    r = naechste;
  }

  return bisektion(punkte);
}

/**
 * Cashflow-Reihe fuer den XIRR eines Gesamtdepots: alle externen Zahlungen,
 * dazu der Depotwert am Stichtag als abschliessender Fluss mit umgekehrtem Vorzeichen.
 *
 * Externe Zufluesse sind aus Depotsicht positiv; aus Anlegersicht sind sie Ausgaben.
 * Deshalb wird das Vorzeichen hier einmal gedreht, und der Endwert kommt positiv dazu.
 */
export function renditeFluesse(externe: readonly Fluss[], endwert: bigint, stichtag: Tag): Fluss[] {
  const fluesse: Fluss[] = externe.map((f) => ({ tag: f.tag, betrag: -f.betrag }));
  fluesse.push({ tag: stichtag, betrag: endwert });
  return fluesse.sort((a, b) => vergleiche(a.tag, b.tag));
}
