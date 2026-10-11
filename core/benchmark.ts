/**
 * Vergleichsdepot: wie hätten sich dieselben externen Flüsse entwickelt, wären sie am
 * selben Tag statt ins echte Depot in eine Benchmark-ISIN geflossen?
 *
 * Liefert dieselbe `DepotTag[]`-Form wie die echte Reihe, damit `kursgewinnFenster()`
 * aus `kursgewinn.ts` sie unveraendert entgegennimmt — keine eigene Prozentrechnung.
 */

import type { Cent, KursE6, MengeE8 } from './dezimal.ts';
import { rundeAufCent, wert, zuKursE6 } from './dezimal.ts';
import type { Tag } from './kalender.ts';
import { frueher, plusTage, vergleiche } from './kalender.ts';
import type { Rasterwert } from './kursraster.ts';
import { baueEinzahlungsreihe } from './mengenreihe.ts';
import type { Zinsreihe } from './risiko.ts';
import type { DepotTag, Fluss } from './typen.ts';

export type Benchmarkeingaben = {
  /** Externe Fluesse des echten Depots. Zufluss positiv, Abfluss negativ. */
  readonly fluesse: readonly Fluss[];
  /** Kursraster der Benchmark-ISIN ueber dieselbe Spanne wie die echte Reihe. */
  readonly raster: ReadonlyMap<Tag, Rasterwert>;
  readonly von: Tag;
  readonly bis: Tag;
};

/**
 * Anteile, die ein Betrag zu diesem Kurs kauft — die Umkehrung von `wert()`:
 * `wert(menge, kurs) = menge * kurs / 1e12`, also `menge = betrag * 1e12 / kurs`.
 */
function mengeFuer(betrag: Cent, kurs: KursE6): MengeE8 {
  return rundeAufCent(betrag * 10n ** 12n, kurs) as unknown as MengeE8;
}

/**
 * Baut das Vergleichsdepot.
 *
 * Simuliert wird immer ab dem ersten Fluss, nicht erst ab `von` — sonst zeigt ein
 * kurzes Fenster ("letzte 3 Monate") ein Vergleichsdepot ohne die fruehere Position.
 * `nettoEinzahlungKumCent` kommt aus derselben `baueEinzahlungsreihe()` wie die echte
 * Reihe, damit beide Linien auf derselben Grundlage stehen.
 */
export function baueBenchmarkreihe(e: Benchmarkeingaben): DepotTag[] {
  const { fluesse, raster, von, bis } = e;

  const fluessePerTag = new Map<Tag, Cent>();
  let ersterFlussTag: Tag | null = null;
  for (const f of fluesse) {
    fluessePerTag.set(f.tag, (fluessePerTag.get(f.tag) ?? 0n) + f.betrag);
    if (ersterFlussTag === null || vergleiche(f.tag, ersterFlussTag) < 0) ersterFlussTag = f.tag;
  }

  const start = ersterFlussTag === null ? von : frueher(ersterFlussTag, von);
  const einzahlungen = baueEinzahlungsreihe(fluesse, von, bis);

  const zeilen: DepotTag[] = [];

  let cash = 0n;
  let anteile = 0n;
  let letzterKurs: KursE6 | null = null;

  for (let t = start; vergleiche(t, bis) <= 0; t = plusTage(t, 1)) {
    cash += fluessePerTag.get(t) ?? 0n;

    const rasterwert = raster.get(t);
    const lueckenhaft = rasterwert === undefined;

    if (rasterwert !== undefined) {
      letzterKurs = rasterwert.kurs;
      if (cash > 0n) {
        anteile += mengeFuer(cash, letzterKurs);
        cash = 0n;
      } else if (cash < 0n) {
        const bedarf = -cash;
        const gehalten = wert(anteile, letzterKurs);
        const verkauft = bedarf < gehalten ? bedarf : gehalten;
        anteile -= mengeFuer(verkauft, letzterKurs);
        cash += verkauft;
      }
    }

    if (vergleiche(t, von) < 0) continue;

    const wertpapiereCent = letzterKurs === null ? 0n : wert(anteile, letzterKurs);

    zeilen.push({
      tag: t,
      wertpapiereCent,
      cashCent: cash,
      gesamtCent: wertpapiereCent + cash,
      nettoEinzahlungKumCent: einzahlungen.get(t) ?? 0n,
      lueckenhaft,
    });
  }

  return zeilen;
}

/**
 * Kursraster fuer den risikofreien Zins als Vergleichslinie (ADR-026): ein taeglich
 * verzinster Index, gebaut aus der €STR-Zinsreihe statt aus einem echten Kurs — es gibt
 * keine ISIN, `baueBenchmarkreihe` nimmt das Ergebnis aber unveraendert entgegen, weil
 * sie nur `Rasterwert.kurs` braucht.
 *
 * Startet bei 1,000000 am ersten Tag mit einem Zinswert; jeder Folgetag verzinst den
 * Vortageswert mit dem zuletzt bekannten €STR p.a. auf 365 Tage. Ein Tag ohne eigenen
 * Zinswert (Wochenende, Feiertag) fuehrt den zuletzt bekannten Satz fort statt eine
 * Luecke zu reissen — anders als bei einem Kurs gibt es dafuer keinen Nichthandelstag.
 * Vor dem ersten Zinswert (vor dem 2019-10-01 oder Zinsquelle abgeschaltet) bleibt der
 * Tag ohne Eintrag: `baueBenchmarkreihe` haelt das Cash dann unveraendert und markiert
 * den Tag als lueckenhaft, genau wie bei einer fehlenden Kurshistorie.
 */
export function risikofreiesRaster(zinsreihe: Zinsreihe, von: Tag, bis: Tag): Map<Tag, Rasterwert> {
  const raster = new Map<Tag, Rasterwert>();
  let kurs: number | null = null;
  let letzterZins: number | null = null;

  for (let t = von; vergleiche(t, bis) <= 0; t = plusTage(t, 1)) {
    const zinsHeute = zinsreihe.get(t);

    if (kurs === null) {
      if (zinsHeute === undefined) continue;
      kurs = 1;
    } else if (letzterZins !== null) {
      kurs *= 1 + letzterZins / 365;
    }

    raster.set(t, { kurs: zuKursE6(kurs.toFixed(12)), gefuellt: zinsHeute === undefined });
    if (zinsHeute !== undefined) letzterZins = zinsHeute;
  }

  return raster;
}
