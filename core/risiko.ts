/**
 * Risikokennzahlen: Volatilitaet, Max. Drawdown, Sharpe-Ratio.
 *
 * Basis ist immer der TWR-Index (`core/twr.ts`), nie `gesamtCent` — der Index ist
 * bereits um Ein- und Auszahlungen bereinigt, sonst saehe eine grosse Einzahlung wie
 * ein Kurssprung aus. Begruendung der Einzelentscheidungen: ADR-009.
 *
 * Monatsrenditen statt Tagesrenditen, damit die groben (Monatsraster-)und die feinen
 * (Tageskurs-)Jahre einheitlich behandelt werden, siehe `GROB_AB_TAGEN` in `twr.ts`.
 * Max. Drawdown ist die Ausnahme: er braucht nur zwei Indexpunkte und laeuft auf der
 * vollen Auflösung, damit ein Einbruch innerhalb eines Monats nicht verschluckt wird.
 */

import type { Tag } from './kalender.ts';
import { istVor, monatVon, monatsEnde } from './kalender.ts';
import type { TwrErgebnis } from './twr.ts';

/** Tag -> €STR p.a., z.B. 0.0325 (= 3,25 %). */
export type Zinsreihe = ReadonlyMap<Tag, number>;

export type Monatsrendite = { readonly monat: string; readonly rendite: number };

const WURZEL_ZWOELF = Math.sqrt(12);

/** Mindestzahl an Monatsrenditen fuer Volatilitaet/Sharpe — entspricht 13 Monaten Historie. */
export const MIN_MONATE = 12;

/**
 * Letzter Indexwert je Monat, Rendite zwischen zwei aufeinanderfolgenden Monatsenden.
 * Der laufende Monat fehlt, bis er vorbei ist: als Teilmonat wuerde er wie ein voller
 * zaehlen, und Sharpe zoege dafuer den vollen Monatszins ab. [ADR-043]
 */
export function monatsrenditen(index: TwrErgebnis['index'], heute: Tag): Monatsrendite[] {
  const laufend = monatVon(heute);
  const bisVormonat = istVor(heute, monatsEnde(laufend)) ? index.filter((p) => monatVon(p.tag) !== laufend) : index;
  if (bisVormonat.length === 0) return [];

  const letzterWertJeMonat = new Map<string, number>();
  for (const punkt of bisVormonat) letzterWertJeMonat.set(monatVon(punkt.tag), punkt.wert);

  const monate = [...letzterWertJeMonat.keys()].sort();
  const renditen: Monatsrendite[] = [];

  for (let i = 1; i < monate.length; i += 1) {
    const monat = monate[i]!;
    const basis = letzterWertJeMonat.get(monate[i - 1]!)!;
    if (basis === 0) continue; // kein sinnvolles Verhaeltnis von einem Nullwert aus
    renditen.push({ monat, rendite: letzterWertJeMonat.get(monat)! / basis - 1 });
  }

  return renditen;
}

export type MaxDrawdownErgebnis =
  | { readonly art: 'ok'; readonly anteil: number; readonly tagHoch: Tag; readonly tagTief: Tag }
  | { readonly art: 'zu_wenig_daten' };

/**
 * Groesster Rueckgang vom laufenden Hoch, auf dem vollen TWR-Index — unabhaengig von
 * der Monatsrendite-Schwelle, braucht nur zwei Indexpunkte.
 */
export function maxDrawdown(index: TwrErgebnis['index']): MaxDrawdownErgebnis {
  if (index.length < 2) return { art: 'zu_wenig_daten' };

  let hochWert = index[0]!.wert;
  let hochTag = index[0]!.tag;
  let schlimmsterAnteil = 0;
  let schlimmsterTagHoch = hochTag;
  let schlimmsterTagTief = hochTag;

  for (const punkt of index) {
    if (punkt.wert > hochWert) {
      hochWert = punkt.wert;
      hochTag = punkt.tag;
    }
    if (hochWert === 0) continue; // kein sinnvoller Rueckgang von einem Nullwert aus
    const ruckgang = punkt.wert / hochWert - 1;
    if (ruckgang < schlimmsterAnteil) {
      schlimmsterAnteil = ruckgang;
      schlimmsterTagHoch = hochTag;
      schlimmsterTagTief = punkt.tag;
    }
  }

  return { art: 'ok', anteil: schlimmsterAnteil, tagHoch: schlimmsterTagHoch, tagTief: schlimmsterTagTief };
}

function stichprobenStdabw(werte: readonly number[]): number {
  const mittel = werte.reduce((summe, w) => summe + w, 0) / werte.length;
  const summeQuadrate = werte.reduce((summe, w) => summe + Math.pow(w - mittel, 2), 0);
  return Math.sqrt(summeQuadrate / (werte.length - 1));
}

export type VolatilitaetErgebnis =
  | { readonly art: 'ok'; readonly proJahr: number; readonly monate: number }
  | { readonly art: 'zu_wenig_daten' };

/** Stichproben-Standardabweichung (n-1) der Monatsrenditen, auf das Jahr hochgerechnet mit sqrt(12). */
export function volatilitaetProJahr(renditen: readonly Monatsrendite[]): VolatilitaetErgebnis {
  if (renditen.length < MIN_MONATE) return { art: 'zu_wenig_daten' };
  const proJahr = stichprobenStdabw(renditen.map((r) => r.rendite)) * WURZEL_ZWOELF;
  return { art: 'ok', proJahr, monate: renditen.length };
}

/** Durchschnittlicher €STR p.a. je Monat, nur fuer Monate mit mindestens einem Tageswert. */
function durchschnittlicherZinsJeMonat(zinsreihe: Zinsreihe): Map<string, number> {
  const summeJeMonat = new Map<string, { summe: number; anzahl: number }>();
  for (const [tag, zinsProJahr] of zinsreihe) {
    const monat = monatVon(tag);
    const eintrag = summeJeMonat.get(monat) ?? { summe: 0, anzahl: 0 };
    eintrag.summe += zinsProJahr;
    eintrag.anzahl += 1;
    summeJeMonat.set(monat, eintrag);
  }
  const ergebnis = new Map<string, number>();
  for (const [monat, e] of summeJeMonat) ergebnis.set(monat, e.summe / e.anzahl);
  return ergebnis;
}

export type SharpeErgebnis =
  | { readonly art: 'ok'; readonly wert: number; readonly monate: number; readonly zinsProJahr: number }
  | { readonly art: 'zu_wenig_daten' }
  | { readonly art: 'keine_streuung' } // Streuung = 0 -> Division durch 0 vermieden
  | { readonly art: 'kein_zins' }; // Zinsreihe leer (Ingest nie gelaufen / abgeschaltet)

/**
 * Ein Monat geht nur in die Rechnung ein, wenn ein ECHTER €STR-Durchschnitt fuer genau
 * diesen Monat vorliegt (Durchschnitt der Tageswerte, deren `monatVon(tag)` passt).
 * Fehlt er, faellt der Monat aus der Rechnung — kein Fortschreiben wie bei VPI, um keine
 * zweite Fortschreib-Mechanik nur fuer diese eine Kennzahl zu bauen.
 *
 * Zaehler: arithmetisches Mittel der monatlichen Ueberschussrendite × 12 (Standard-Sharpe,
 * keine geometrische Verkettung wie bei TWR) — bleibt unabhaengig von TWRs eigener
 * Annualisierung, die unter einem Jahr `null` ist.
 */
export function sharpeRatio(renditen: readonly Monatsrendite[], zinsreihe: Zinsreihe): SharpeErgebnis {
  if (zinsreihe.size === 0) return { art: 'kein_zins' };

  const zinsJeMonat = durchschnittlicherZinsJeMonat(zinsreihe);

  const ueberschuesse: number[] = [];
  const genutzteZinsen: number[] = [];
  for (const r of renditen) {
    const zinsProJahr = zinsJeMonat.get(r.monat);
    if (zinsProJahr === undefined) continue;
    ueberschuesse.push(r.rendite - zinsProJahr / 12);
    genutzteZinsen.push(zinsProJahr);
  }

  if (ueberschuesse.length < MIN_MONATE) return { art: 'zu_wenig_daten' };

  const mittelProJahr = (ueberschuesse.reduce((summe, u) => summe + u, 0) / ueberschuesse.length) * 12;
  const streuungProJahr = stichprobenStdabw(ueberschuesse) * WURZEL_ZWOELF;
  const zinsProJahrMittel = genutzteZinsen.reduce((summe, z) => summe + z, 0) / genutzteZinsen.length;

  if (streuungProJahr === 0) return { art: 'keine_streuung' };

  return { art: 'ok', wert: mittelProJahr / streuungProJahr, monate: ueberschuesse.length, zinsProJahr: zinsProJahrMittel };
}
