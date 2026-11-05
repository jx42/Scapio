/**
 * Jahresuebersicht: dieselben Groessen wie in den Kennzahlen, nach Kalenderjahr gefenstert.
 *
 * Die Rendite eines Jahres ist der TWR zwischen den Indexstaenden zweier Jahresenden —
 * aus derselben Verkettung wie die Gesamt-TWR, nicht je Jahr neu begonnen, damit sich die
 * Jahre wieder zur Gesamtrendite multiplizieren. Der Vergleich rechnet genauso ueber das
 * Vergleichsdepot (`core/benchmark.ts`). Ein angebrochenes Jahr wird nicht hochgerechnet. [P-10]
 *
 * Die Teuerung eines Jahres ist Dezember gegen Dezember, im ersten Jahr ab dem Monat vor
 * dem ersten Tag, im laufenden bis zum letzten Monat mit echter Zahl. Fortgeschrieben wird
 * nichts: eine unterstellte Nullinflation waere eine erfundene Realrendite. [P-05]
 *
 * Der IZF eines Jahres laeuft vom Depotwert am Vorjahresende (als Einzahlung) ueber die
 * externen Fluesse bis zum Depotwert am Jahresende. Wie die TWR gilt er fuer den Zeitraum
 * der Zeile, nicht aufs Jahr hochgerechnet. Die Realrendite rechnet wie die Karte ueber dem
 * Verlauf: derselbe IZF ueber Fluesse in Kaufkraft des letzten Monats der Zeile. [ADR-062]
 */

import type { Cent } from './dezimal.ts';
import type { Vpi } from './inflation.ts';
import { deflationiere } from './inflation.ts';
import type { Tag } from './kalender.ts';
import { alsTag, monatVon, tageZwischen, vergleiche } from './kalender.ts';
import { twr } from './twr.ts';
import { TAGE_IM_JAHR, renditeFluesse, xirr } from './xirr.ts';
import type { DepotTag, Fluss } from './typen.ts';

export type Jahreszeile = {
  /** `YYYY`. */
  readonly jahr: string;
  /** Erster Tag der Reihe, wenn sie in diesem Jahr nach dem 1. Januar beginnt; sonst null. */
  readonly ab: Tag | null;
  /** Letzter Tag der Reihe, wenn sie in diesem Jahr vor dem 31. Dezember endet; sonst null. */
  readonly bis: Tag | null;
  readonly twr: number | null;
  /** TWR des Vergleichsdepots; null ohne Vergleich oder ohne Kurs in diesem Jahr. */
  readonly vergleich: number | null;
  readonly teuerung: number | null;
  /** Letzter Monat, den `teuerung` abdeckt. */
  readonly teuerungBisMonat: string | null;
  /** Geldgewichtete Rendite des Zeitraums der Zeile; null, wenn der IZF nicht loesbar ist. */
  readonly izf: number | null;
  /** IZF ueber inflationsbereinigte Fluesse; null ohne IZF oder ohne Teuerung. */
  readonly real: number | null;
  /** Gesamtgewinn des Jahres: Veraenderung von Depotwert minus eingezahltem Kapital. */
  readonly gewinnCent: Cent;
  /** Netto-Einzahlung des Jahres. */
  readonly einzahlungCent: Cent;
  readonly endwertCent: Cent;
};

export type JahreEingaben = {
  readonly reihe: readonly DepotTag[];
  readonly externe: readonly Fluss[];
  /** Vergleichsdepot ueber dieselbe Spanne wie `reihe`, oder null. */
  readonly vergleichsreihe: readonly DepotTag[] | null;
  readonly vpi: Vpi;
};

type Indexpunkt = { readonly tag: Tag; readonly wert: number };

function jahrVon(t: Tag): string {
  return t.slice(0, 4);
}

function vorjahr(jahr: string): string {
  return String(Number(jahr) - 1);
}

/** Letzter Indexstand bis einschliesslich `tag`; null, wenn der Index erst danach beginnt. */
function indexBis(index: readonly Indexpunkt[], tag: string): number | null {
  let wert: number | null = null;
  for (const p of index) {
    if (p.tag > tag) break;
    wert = p.wert;
  }
  return wert;
}

/** Rendite des Jahres aus dem Index — Basis ist das Vorjahresende, im ersten Jahr der Start. */
function jahresrendite(index: readonly Indexpunkt[], jahr: string): number | null {
  const ende = indexBis(index, `${jahr}-12-31`);
  const basis = indexBis(index, `${vorjahr(jahr)}-12-31`) ?? index[0]?.wert ?? null;
  if (ende === null || basis === null || basis <= 0) return null;
  return ende / basis - 1;
}

function vorMonat(monat: string): string {
  const j = Number(monat.slice(0, 4));
  const m = Number(monat.slice(5, 7));
  return m === 1 ? `${String(j - 1)}-12` : `${String(j)}-${String(m - 1).padStart(2, '0')}`;
}

function teuerungImJahr(vpi: Vpi, ab: Tag | null, bis: Tag, jahr: string): { teuerung: number | null; bisMonat: string | null } {
  const basisMonat = ab === null ? `${vorjahr(jahr)}-12` : vorMonat(monatVon(ab));
  const grenze = monatVon(bis);
  let endeMonat: string | null = null;
  for (const monat of vpi.keys()) {
    if (monat <= basisMonat || monat > grenze) continue;
    if (endeMonat === null || monat > endeMonat) endeMonat = monat;
  }
  const basis = vpi.get(basisMonat);
  if (endeMonat === null || basis === undefined || basis <= 0) return { teuerung: null, bisMonat: null };
  return { teuerung: vpi.get(endeMonat)! / basis - 1, bisMonat: endeMonat };
}

/** IZF ueber den Zeitraum der Fluesse, zurueckgerechnet von p.a. auf diesen Zeitraum. */
function periodenIzf(fluesse: readonly Fluss[]): number | null {
  const ergebnis = xirr(fluesse);
  if (ergebnis.art !== 'ok') return null;
  const tage = tageZwischen(fluesse[0]!.tag, fluesse[fluesse.length - 1]!.tag);
  return (1 + ergebnis.rate) ** (tage / TAGE_IM_JAHR) - 1;
}

/** Eine Zeile je Kalenderjahr der Reihe, aeltestes zuerst. */
export function jahresuebersicht(e: JahreEingaben): Jahreszeile[] {
  const reihe = [...e.reihe].sort((a, b) => vergleiche(a.tag, b.tag));
  if (reihe.length === 0) return [];

  const index = twr(reihe, e.externe).index;
  const vergleichsIndex = e.vergleichsreihe === null ? null : twr(e.vergleichsreihe, e.externe).index;
  // Ein Jahr ohne einen einzigen Kurs der Benchmark haette einen flachen Index und damit
  // eine Rendite von 0 — das waere eine Behauptung, keine Messung.
  const vergleichsJahre = new Set(
    (e.vergleichsreihe ?? []).filter((t) => !t.lueckenhaft).map((t) => jahrVon(t.tag)),
  );

  const jeJahr = new Map<string, { erster: DepotTag; letzter: DepotTag }>();
  for (const t of reihe) {
    const jahr = jahrVon(t.tag);
    const eintrag = jeJahr.get(jahr);
    if (eintrag === undefined) jeJahr.set(jahr, { erster: t, letzter: t });
    else eintrag.letzter = t;
  }

  // Angebrochen sind nur das erste und das letzte Jahr: dazwischen schliesst jedes Jahr an
  // das Vorjahresende an, auch wenn sein erster Punkt (Wochenende, Monatsraster) spaeter liegt.
  const erstesJahr = jahrVon(reihe[0]!.tag);
  const letztesJahr = jahrVon(reihe[reihe.length - 1]!.tag);
  const zeilen: Jahreszeile[] = [];
  let vorher: DepotTag | null = null;
  for (const [jahr, { erster, letzter }] of jeJahr) {
    const ab = jahr !== erstesJahr || erster.tag === alsTag(`${jahr}-01-01`) ? null : erster.tag;
    const bis = jahr !== letztesJahr || letzter.tag === alsTag(`${jahr}-12-31`) ? null : letzter.tag;
    const rendite = jahresrendite(index, jahr);
    const { teuerung, bisMonat } = teuerungImJahr(e.vpi, ab, letzter.tag, jahr);

    const gewinnVorher = vorher === null ? 0n : vorher.gesamtCent - vorher.nettoEinzahlungKumCent;
    const einzahlungVorher = vorher === null ? 0n : vorher.nettoEinzahlungKumCent;

    // Fluesse am Tag von `vorher` stecken schon in dessen Depotwert.
    const imJahr = e.externe.filter(
      (f) => (vorher === null || vergleiche(f.tag, vorher.tag) > 0) && vergleiche(f.tag, letzter.tag) <= 0,
    );
    const start: Fluss[] = vorher === null ? [] : [{ tag: vorher.tag, betrag: vorher.gesamtCent }];
    const fluesse = renditeFluesse([...start, ...imJahr], letzter.gesamtCent, letzter.tag);
    const izf = periodenIzf(fluesse);
    const real =
      izf === null || teuerung === null
        ? null
        : periodenIzf(deflationiere(fluesse, e.vpi, monatVon(letzter.tag)).fluesse);

    zeilen.push({
      jahr,
      ab,
      bis,
      twr: rendite,
      vergleich:
        vergleichsIndex === null || !vergleichsJahre.has(jahr) ? null : jahresrendite(vergleichsIndex, jahr),
      teuerung,
      teuerungBisMonat: bisMonat,
      izf,
      real,
      gewinnCent: letzter.gesamtCent - letzter.nettoEinzahlungKumCent - gewinnVorher,
      einzahlungCent: letzter.nettoEinzahlungKumCent - einzahlungVorher,
      endwertCent: letzter.gesamtCent,
    });
    vorher = letzter;
  }

  return zeilen;
}
