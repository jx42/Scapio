/**
 * Buendelt alles zu einem Kennzahlen-Objekt.
 *
 * Die einzige Funktion, die der Server aufruft: sie bekommt die gespeicherten Daten
 * und den heutigen Tag als Parameter und gibt zurueck, was die Oberflaeche zeigt.
 * Hier wird nichts gelesen und nichts geschrieben. [INV-04]
 */

import { restAnteil } from './anteile.ts';
import type { Cent } from './dezimal.ts';
import { anteil } from './dezimal.ts';
import { externeFluesse } from './depotreihe.ts';
import type { DriftErgebnis } from './drift.ts';
import { fifo, positionsFluesse } from './fifo.ts';
import type { Flussuebersicht } from './fluesse.ts';
import { monatsFluesse } from './fluesse.ts';
import type { Vpi, RealErgebnis } from './inflation.ts';
import { realeRendite } from './inflation.ts';
import type { Tag } from './kalender.ts';
import { vergleiche } from './kalender.ts';
import type { MaxDrawdownErgebnis, SharpeErgebnis, VolatilitaetErgebnis, Zinsreihe } from './risiko.ts';
import { maxDrawdown, monatsrenditen, sharpeRatio, volatilitaetProJahr } from './risiko.ts';
import type { TwrErgebnis } from './twr.ts';
import { twr } from './twr.ts';
import type { Bestand, DepotTag, Isin, Tx } from './typen.ts';
import { einordnen, istBekannterTyp, istGebuehr, istSteuer, zaehlt } from './typen.ts';
import { ausgeglicheneUebertraege } from './uebertraege.ts';
import type { XirrErgebnis } from './xirr.ts';
import { renditeFluesse, xirr } from './xirr.ts';

export type Position = {
  readonly isin: Isin;
  readonly name: string;
  readonly wertCent: Cent;
  readonly anteil: number;
  readonly investiertCent: Cent;
  readonly gewinnCent: Cent;
  readonly gewinnProzent: number;
  readonly realisiertCent: Cent;
  readonly xirr: XirrErgebnis;
};

export type Hinweis = {
  readonly code: string;
  readonly text: string;
};

/**
 * Worauf sich eine Ertrags- oder Steuerbuchung bezieht. Der Kern entscheidet die
 * Sachlage, die Oberflaeche waehlt das Wort — hier steht deshalb kein deutscher Text.
 *
 * `unbekannt` ist kein Platzhalter fuer "noch nicht gebaut", sondern eine Aussage: die
 * Bank hat zu dieser Buchung kein Bezugswertpapier geliefert. Die ISIN steht bei
 * manchen dieser Zeilen in `beschreibung` — Fremdtext, der nicht ausgewertet wird
 * [INV-06]. Ein geratener Bezug waere schlechter als ein eingestandener Strich. [P-08]
 */
export type Ertragsbezug = 'wertpapier' | 'verrechnungskonto' | 'unbekannt';

/** Eine einzelne Ertrags- oder Steuertransaktion fuer die Detailansicht einer Kennzahl. */
export type ErtragsZeile = {
  readonly txId: string;
  readonly tag: Tag;
  /** Typ der Bank, unveraendert uebernommen — siehe `Tx.typ`. */
  readonly typ: string;
  /** Das bezogene Wertpapier: `Tx.isin`, sonst `Tx.bezugIsin`. Nur zur Anzeige. */
  readonly isin: Isin | null;
  readonly name: string | null;
  readonly bezug: Ertragsbezug;
  readonly betragCent: Cent;
};

/** Ein einzelner nach FIFO abgerechneter Verkauf fuer die Detailansicht "Realisierte Gewinne". */
export type RealisierteZeile = {
  readonly txId: string;
  readonly tag: Tag;
  readonly isin: Isin;
  readonly name: string;
  readonly gewinnCent: Cent;
};

export type Kennzahlen = {
  /** Summe der offenen Einstaende: das Geld, das heute in Positionen steckt. */
  readonly investiertCent: Cent;
  /** Buchgewinn der offenen Positionen. */
  readonly kursgewinnCent: Cent;
  /** Kursgewinn ueber alle offenen Positionen hinweg, bezogen auf den Einstand. */
  readonly kursgewinnProzent: number;
  readonly realisiertCent: Cent;
  readonly zinsenCent: Cent;
  readonly steuernCent: Cent;
  /** Summe der `FEE`-Buchungen, negativ. Kaufkosten stecken im Einstand, nicht hier. */
  readonly gebuehrenCent: Cent;
  readonly gesamtCent: Cent;
  readonly cashCent: Cent;
  /** Was die Positionsanteile offen lassen, ist Cash. 0..1. */
  readonly cashAnteil: number;
  readonly nettoEinzahlungCent: Cent;
  readonly twr: TwrErgebnis;
  readonly xirr: XirrErgebnis;
  readonly real: RealErgebnis;
  readonly maxDrawdown: MaxDrawdownErgebnis;
  readonly volatilitaetProJahr: VolatilitaetErgebnis;
  readonly sharpe: SharpeErgebnis;
  readonly sparrateCent: Cent;
  readonly sparrate12Cent: Cent;
  readonly medianCent: Cent;
  readonly positionen: readonly Position[];
  readonly fluesse: Flussuebersicht;
  readonly hinweise: readonly Hinweis[];
  /** Einzeltransaktionen hinter `zinsenCent`, neueste zuerst. */
  readonly zinsenTransaktionen: readonly ErtragsZeile[];
  /** Einzeltransaktionen hinter `steuernCent`, neueste zuerst. */
  readonly steuernTransaktionen: readonly ErtragsZeile[];
  /** Einzeltransaktionen hinter `gebuehrenCent`, neueste zuerst. */
  readonly gebuehrenTransaktionen: readonly ErtragsZeile[];
  /** Einzelverkaeufe hinter `realisiertCent`, neueste zuerst. */
  readonly realisierteVerkaeufe: readonly RealisierteZeile[];
};

export type KennzahlenEingaben = {
  readonly transaktionen: readonly Tx[];
  readonly reihe: readonly DepotTag[];
  /** Positionswerte des letzten Tages. */
  readonly positionswerte: ReadonlyMap<Isin, Cent>;
  readonly bestand: readonly Bestand[];
  readonly vpi: Vpi;
  readonly zinsreihe: Zinsreihe;
  readonly heute: Tag;
  readonly drift: DriftErgebnis;
};

/**
 * Worauf bezieht sich diese Buchung?
 *
 * Zinsen auf eine reine Cash-Buchung sind Zinsen auf ein Guthaben — es gibt gar kein
 * anderes, worauf sie sich beziehen koennten. Alles Uebrige ohne Bezugswertpapier
 * bleibt `unbekannt`: eine Vorabpauschale gehoert zu einem ETF, und welcher das ist,
 * sagt die Bank in diesen Zeilen nicht.
 */
function ertragsbezug(tx: Tx, bezugsIsin: Isin | null): Ertragsbezug {
  if (bezugsIsin !== null) return 'wertpapier';
  if (tx.art === 'CASH' && tx.typ.toUpperCase() === 'INTEREST') return 'verrechnungskonto';
  return 'unbekannt';
}

export function berechneKennzahlen(e: KennzahlenEingaben): Kennzahlen {
  const { transaktionen, reihe, positionswerte, bestand, vpi, heute } = e;

  const sortierteReihe = [...reihe].sort((a, b) => vergleiche(a.tag, b.tag));
  const letzte = sortierteReihe[sortierteReihe.length - 1] ?? null;

  const gesamt = letzte?.gesamtCent ?? 0n;
  const cash = letzte?.cashCent ?? 0n;
  const nettoEinzahlung = letzte?.nettoEinzahlungKumCent ?? 0n;

  // Einmal ueber die gesamte Historie berechnet und an jede Stelle durchgereicht, die
  // sie braucht, statt je Aufruf (und hier je offener Position) neu.
  const ausgeglichen = ausgeglicheneUebertraege(transaktionen);

  const { einstaende, verkaeufe } = fifo(transaktionen, ausgeglichen);
  const externe = externeFluesse(transaktionen, ausgeglichen);

  let investiert = 0n;
  let realisiert = 0n;
  for (const [, e2] of einstaende) {
    investiert += e2.einstand;
    realisiert += e2.realisiert;
  }

  const namen = new Map<Isin, string>();
  for (const b of bestand) namen.set(b.isin, b.name);

  const positionen: Position[] = [];
  let wertpapiere = 0n;

  for (const [isin, einstand] of einstaende) {
    if (einstand.menge === 0n) continue;

    const wertCent = positionswerte.get(isin) ?? 0n;
    wertpapiere += wertCent;
    const gewinn = wertCent - einstand.einstand;

    positionen.push({
      isin,
      name: namen.get(isin) ?? isin,
      wertCent,
      anteil: anteil(wertCent, gesamt),
      investiertCent: einstand.einstand,
      gewinnCent: gewinn,
      gewinnProzent: einstand.einstand === 0n ? 0 : Number(gewinn) / Number(einstand.einstand),
      realisiertCent: einstand.realisiert,
      xirr: xirr(positionsFluesse(transaktionen, isin, wertCent, heute, ausgeglichen), heute),
    });
  }

  positionen.sort((a, b) => (a.wertCent > b.wertCent ? -1 : a.wertCent < b.wertCent ? 1 : 0));

  // Ertraege und Steuern getrennt ausweisen — nach TYP, nicht nach Vorzeichen. [ADR-014]
  //
  // Nach Vorzeichen zu trennen sah richtig aus, solange jede Steuer negativ und jeder
  // Ertrag positiv war. Beides stimmt nicht: eine Steuererstattung ist eine positive
  // Steuerbuchung, negative Zinsen (Sollzins auf dem Verrechnungskonto) sind ein
  // negativer Ertrag. Vor allem aber ist `TAX` intern eingeordnet und fiel dadurch aus
  // beiden Toepfen — die Kennzahl "Steuern" zeigte den Steuerabzug ueberhaupt nicht.
  let zinsen = 0n;
  let steuern = 0n;
  let gebuehren = 0n;
  const zinsenTransaktionen: ErtragsZeile[] = [];
  const steuernTransaktionen: ErtragsZeile[] = [];
  const gebuehrenTransaktionen: ErtragsZeile[] = [];
  for (const tx of transaktionen) {
    if (!zaehlt(tx)) continue;
    const steuerbuchung = istSteuer(tx.typ);
    const gebuehr = istGebuehr(tx.typ);
    if (!steuerbuchung && !gebuehr && einordnen(tx.typ) !== 'ertrag') continue;

    // Ein Wertpapierbezug steht je nach Buchungsart im einen oder im anderen Feld:
    // eine Ausschuettung bewegt keine Stuecke und traegt deshalb nur `bezugIsin`.
    const bezugsIsin = tx.isin ?? tx.bezugIsin;
    const zeile: ErtragsZeile = {
      txId: tx.id,
      tag: tx.tag,
      typ: tx.typ,
      isin: bezugsIsin,
      name: bezugsIsin === null ? null : (namen.get(bezugsIsin) ?? bezugsIsin),
      bezug: ertragsbezug(tx, bezugsIsin),
      betragCent: tx.betragCent,
    };

    if (steuerbuchung) {
      steuern += tx.betragCent;
      steuernTransaktionen.push(zeile);
    } else if (gebuehr) {
      gebuehren += tx.betragCent;
      gebuehrenTransaktionen.push(zeile);
    } else {
      zinsen += tx.betragCent;
      zinsenTransaktionen.push(zeile);
    }
  }
  zinsenTransaktionen.sort((a, b) => vergleiche(b.tag, a.tag));
  steuernTransaktionen.sort((a, b) => vergleiche(b.tag, a.tag));
  gebuehrenTransaktionen.sort((a, b) => vergleiche(b.tag, a.tag));

  const realisierteVerkaeufe: RealisierteZeile[] = verkaeufe
    .map((v) => ({
      txId: v.txId,
      tag: v.tag,
      isin: v.isin,
      name: namen.get(v.isin) ?? v.isin,
      gewinnCent: v.gewinnCent,
    }))
    .sort((a, b) => vergleiche(b.tag, a.tag));

  const rendite = renditeFluesse(externe, gesamt, heute);
  const nominal = xirr(rendite, heute);

  const uebersicht = monatsFluesse(externe, heute);

  const kursgewinn = wertpapiere - investiert;

  const twrErgebnis = twr(sortierteReihe, externe);
  const renditen = monatsrenditen(twrErgebnis.index, heute);

  return {
    investiertCent: investiert,
    kursgewinnCent: kursgewinn,
    kursgewinnProzent: investiert === 0n ? 0 : Number(kursgewinn) / Number(investiert),
    realisiertCent: realisiert,
    zinsenCent: zinsen,
    steuernCent: steuern,
    gebuehrenCent: gebuehren,
    gesamtCent: gesamt,
    cashCent: cash,
    cashAnteil: restAnteil(positionen.map((p) => p.anteil)),
    nettoEinzahlungCent: nettoEinzahlung,
    twr: twrErgebnis,
    xirr: nominal,
    real: realeRendite(rendite, vpi, heute, nominal),
    maxDrawdown: maxDrawdown(twrErgebnis.index),
    volatilitaetProJahr: volatilitaetProJahr(renditen),
    sharpe: sharpeRatio(renditen, e.zinsreihe),
    sparrateCent: uebersicht.schnitt,
    sparrate12Cent: uebersicht.schnitt12,
    medianCent: uebersicht.median,
    positionen,
    fluesse: uebersicht,
    hinweise: sammleHinweise(e, sortierteReihe),
    zinsenTransaktionen,
    steuernTransaktionen,
    gebuehrenTransaktionen,
    realisierteVerkaeufe,
  };
}

function sammleHinweise(e: KennzahlenEingaben, reihe: readonly DepotTag[]): Hinweis[] {
  const hinweise: Hinweis[] = [];

  const unbekannt = new Set<string>();
  for (const tx of e.transaktionen) {
    if (!istBekannterTyp(tx.typ)) unbekannt.add(tx.typ);
  }
  if (unbekannt.size > 0) {
    hinweise.push({
      code: 'H_UNBEKANNTER_TYP',
      text: `${unbekannt.size} unbekannte Transaktionstypen gelten als intern und ändern die Rendite nicht.`,
    });
  }

  const luecken = reihe.filter((t) => t.lueckenhaft).length;
  if (luecken > 0) {
    hinweise.push({
      code: 'H_KURSLUECKE',
      text: `${luecken} Tage ohne vollständige Kurse. Der Verlauf ist dort geschätzt.`,
    });
  }

  if (e.vpi.size === 0) {
    hinweise.push({
      code: 'H_KEIN_VPI',
      text: 'Der Verbraucherpreisindex fehlt. Die Realrendite kann nicht berechnet werden.',
    });
  }

  if (e.zinsreihe.size === 0) {
    hinweise.push({
      code: 'H_KEIN_ZINS',
      text: 'Kein risikofreier Zins hinterlegt. Sharpe-Ratio kann nicht berechnet werden.',
    });
  }

  if (e.drift.stufe === 'ausgesetzt') {
    hinweise.push({ code: 'H_DRIFT_AUSGESETZT', text: e.drift.grund ?? 'Selbstkontrolle ausgesetzt.' });
  }

  return hinweise;
}
