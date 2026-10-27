/**
 * Verschmelzen der vier Zeitfenster zu einer Kursreihe je ISIN.
 *
 * `get_security_chart` loest je Zeitfenster unterschiedlich fein auf: `max` monatlich,
 * `one_year` zweitaegig, `three_months`/`one_month` feiner. Fuer jeden Tag gewinnt der
 * feinste verfuegbare Punkt. Kurse aus Transaktionen schlagen alles — sie sind der
 * tatsaechlich ausgefuehrte Kurs an diesem Handelstag, nicht ein Rasterpunkt.
 */

import type { KursE6 } from './dezimal.ts';
import type { Tag } from './kalender.ts';
import { plusTage, tageZwischen, vergleiche } from './kalender.ts';

export type Herkunft = 'transaktion' | 'chart_1m' | 'chart_3m' | 'chart_1y' | 'chart_max';

export type Kurspunkt = {
  readonly isin: string;
  readonly tag: Tag;
  readonly kurs: KursE6;
  readonly herkunft: Herkunft;
  /** Zeitstempel des Abrufs, ISO 8601. Entscheidet bei Rangegleichstand. */
  readonly abgerufenAm?: string;
};

/** Rang der Herkunft. Hoeher gewinnt. */
export const RANG: Readonly<Record<Herkunft, number>> = {
  transaktion: 4,
  chart_1m: 3,
  chart_3m: 2,
  chart_1y: 1,
  chart_max: 0,
};

/** Laengste Strecke, ueber die vorwaerts gefuellt wird. Was darueber hinausgeht, bleibt Luecke. */
export const FUELL_GRENZE_TAGE = 5;

/** Ein Tagessprung ueber dieser Schwelle wird markiert, nicht abgelehnt. */
export const SPRUNG_SCHWELLE = 0.3;

function schlaegt(neu: Kurspunkt, alt: Kurspunkt): boolean {
  const rangNeu = RANG[neu.herkunft];
  const rangAlt = RANG[alt.herkunft];
  if (rangNeu !== rangAlt) return rangNeu > rangAlt;
  // Gleichstand: der zuletzt abgerufene Punkt gewinnt.
  return (neu.abgerufenAm ?? '') >= (alt.abgerufenAm ?? '');
}

/**
 * Je (isin, tag) gewinnt der hoechste Rang; bei Gleichstand der zuletzt abgerufene.
 * Das Ergebnis ist nach ISIN und Tag sortiert.
 */
export function verschmelzeKurse(punkte: readonly Kurspunkt[]): Kurspunkt[] {
  const beste = new Map<string, Kurspunkt>();

  for (const p of punkte) {
    const schluessel = `${p.isin} ${p.tag}`;
    const bisher = beste.get(schluessel);
    if (bisher === undefined || schlaegt(p, bisher)) beste.set(schluessel, p);
  }

  return [...beste.values()].sort((a, b) => vergleiche(a.isin, b.isin) || vergleiche(a.tag, b.tag));
}

export type Rasterwert = {
  readonly kurs: KursE6;
  /** true, wenn der Wert vorwaerts gefuellt wurde und nicht selbst gemessen ist. */
  readonly gefuellt: boolean;
};

/**
 * Kursraster einer ISIN ueber die Spanne von..bis.
 * Fehlende Tage werden ueber hoechstens FUELL_GRENZE_TAGE Tage vorwaerts gefuellt;
 * laengere Luecken bleiben leer und markieren den Tag als lueckenhaft.
 */
export function rasterFuer(punkte: readonly Kurspunkt[], von: Tag, bis: Tag): Map<Tag, Rasterwert> {
  const sortiert = [...punkte].sort((a, b) => vergleiche(a.tag, b.tag));
  const gemessen = new Map<Tag, KursE6>();
  for (const p of sortiert) gemessen.set(p.tag, p.kurs);

  const raster = new Map<Tag, Rasterwert>();

  let letzterTag: Tag | null = null;
  let letzterKurs: KursE6 | null = null;

  for (let t = von; vergleiche(t, bis) <= 0; t = plusTage(t, 1)) {
    const eigener = gemessen.get(t);
    if (eigener !== undefined) {
      raster.set(t, { kurs: eigener, gefuellt: false });
      letzterTag = t;
      letzterKurs = eigener;
      continue;
    }

    if (letzterKurs !== null && letzterTag !== null && tageZwischen(letzterTag, t) <= FUELL_GRENZE_TAGE) {
      raster.set(t, { kurs: letzterKurs, gefuellt: true });
    }
    // sonst: Luecke, kein Eintrag.
  }

  return raster;
}

/** Letzter gemessener Kurs vor oder an einem Tag, unabhaengig von der Fuellgrenze. */
export function letzterKursBis(punkte: readonly Kurspunkt[], tag: Tag): KursE6 | null {
  let treffer: Kurspunkt | null = null;
  for (const p of punkte) {
    if (vergleiche(p.tag, tag) > 0) continue;
    if (treffer === null || vergleiche(p.tag, treffer.tag) > 0) treffer = p;
  }
  return treffer === null ? null : treffer.kurs;
}

/**
 * Markiert Punkte, deren Tagessprung gegenueber dem Vorgaenger ueber der Schwelle liegt.
 * Es gibt echte Spruenge — ein Ingest, der bei echten Marktbewegungen aussteigt, ist
 * schlimmer als einer, der einen Ausreisser durchlaesst und ihn kennzeichnet. [P-08]
 *
 * `chart_max` bleibt aussen vor: das Fenster loest nur monatlich auf (siehe Kommentar oben),
 * eine grosse relative Aenderung zwischen zwei Monatspunkten ist dort die Regel, kein
 * Ausreisser — sonst wuerde jede normale Kursbewegung ueber Monate als "Tagessprung" markiert.
 *
 * Aus demselben Grund zaehlt nur ein Vorgaenger hoechstens `FUELL_GRENZE_TAGE` zurueck. Ohne
 * Sparplan liegt vor dem ersten `chart_1y`-Punkt oft nur ein Kaufkurs von vor Jahren — der
 * Vergleich mass dann die Rendite seither und markierte jede ISIN am Beginn des Fensters.
 */
export function markiereSpruenge(punkte: readonly Kurspunkt[]): Set<string> {
  const auffaellig = new Set<string>();
  const nachIsin = new Map<string, Kurspunkt[]>();

  for (const p of punkte) {
    if (p.herkunft === 'chart_max') continue;
    const liste = nachIsin.get(p.isin);
    if (liste === undefined) nachIsin.set(p.isin, [p]);
    else liste.push(p);
  }

  for (const [isin, liste] of nachIsin) {
    liste.sort((a, b) => vergleiche(a.tag, b.tag));
    for (let i = 1; i < liste.length; i += 1) {
      const vorher = liste[i - 1]!;
      const jetzt = liste[i]!;
      if (vorher.kurs === 0n || tageZwischen(vorher.tag, jetzt.tag) > FUELL_GRENZE_TAGE) continue;
      const relativ = Math.abs(Number(jetzt.kurs - vorher.kurs) / Number(vorher.kurs));
      if (relativ > SPRUNG_SCHWELLE) auffaellig.add(`${isin} ${jetzt.tag}`);
    }
  }

  return auffaellig;
}
