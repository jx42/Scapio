/**
 * Schritt 5 eines Laufs: Neuberechnung ab der Hochwassermarke (§6.1, §7.3).
 *
 * Der Rechenkern liest nichts und schreibt nichts [INV-04]. Diese Datei ist die Klammer
 * darum: sie holt Transaktionen und Kurse aus den Repositories, laesst `core/` rechnen
 * und schreibt `depot_tag`. Sonst beruehrt sie keine Tabelle.
 *
 * Zwei Entscheidungen, die man dem Code nicht ansieht:
 *
 * 1. Die REIHE wird ueber die ganze Historie gebaut, GESCHRIEBEN wird nur, was sich
 *    unterscheidet. Grund: `kurs` hat keine Aenderungsspalte, also laesst sich
 *    `aeltesterGeaenderterKurs` aus der Datenbank nicht ableiten. Ein nachtraeglich
 *    gefuellter Kurs von 2019 wuerde bei einer rein inkrementellen Rechnung nie
 *    beruecksichtigt — der Fehler waere unsichtbar und dauerhaft. Der Vergleich ueber
 *    `eingabe_hash` faengt ihn dagegen immer. Ueber ~2500 Tage und eine Handvoll ISINs
 *    kostet das den Bruchteil einer Sekunde; die Richtigkeit ist es wert.
 *
 * 2. Damit ist die Funktion zugleich idempotent: derselbe Lauf zweimal schreibt beim
 *    zweiten Mal NULL Tage. Das ist die Haelfte von [INV-09], die man testen kann.
 *
 * `startTagFuerNeuberechnung` wird trotzdem gerufen, und sein Ergebnis hat eine echte
 * Folge: springt `KERN_VERSION`, liefert es den ersten Tag der Historie, und dann werden
 * alle gespeicherten Zeilen verworfen, statt sie mit einer Version zu mischen, nach der
 * sie nie berechnet wurden. [INV-10]
 *
 * `npm run verify` ruft `berechneNeu(db, heute, true)` gegen eine Kopie der Datenbank.
 * Deshalb hat diese Funktion keine Nebenwirkung ausserhalb von `depot_tag`.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Tag } from '../core/kalender.ts';
import { plusTage, vergleiche } from '../core/kalender.ts';
import { baueDepotreihe, startTagFuerNeuberechnung } from '../core/depotreihe.ts';
import type { Hochwassermarke } from '../core/depotreihe.ts';
import type { Kurspunkt, Rasterwert } from '../core/kursraster.ts';
import { rasterFuer, verschmelzeKurse } from '../core/kursraster.ts';
import type { Isin } from '../core/typen.ts';
import { KERN_VERSION } from '../core/version.ts';
import * as repo from '../db/repository/index.ts';
import { inTransaktion } from '../db/repository/index.ts';

/**
 * Fenster, ueber das lueckenhafte Tage gemeldet werden.
 *
 * Die Gesamtzahl taugt nicht als Meldung: sie wird von der Fruehzeit des Depots
 * beherrscht, in der es je ISIN nur Monatsstaende gibt, steht damit dauerhaft im
 * vierstelligen Bereich und meldet bei jedem Lauf denselben unveraenderlichen
 * Zustand. Was man wissen will, ist der frische Ausfall: eine ISIN, die seit
 * gestern keine Kurse mehr liefert. Der faellt in dieses Fenster, der Altbestand
 * nicht. 30 Tage, weil das Kursraster ohnehin ueber `FUELL_GRENZE_TAGE` Tage
 * vorwaerts fuellt und Wochenenden und Feiertage deshalb gar nicht erst als
 * Luecke erscheinen — was hier auftaucht, ist echter Ausfall.
 */
export const JUNGE_SPANNE_TAGE = 30;

export type NeuberechnungErgebnis = {
  readonly neuBerechneteTage: number;
  readonly ersterNeuerTag: Tag | null;
  readonly lueckenhafteTage: number;
  /** Davon in den letzten `JUNGE_SPANNE_TAGE` Tagen — nur diese werden gemeldet. */
  readonly lueckenhafteTageJung: number;
};

const LEER: NeuberechnungErgebnis = {
  neuBerechneteTage: 0,
  ersterNeuerTag: null,
  lueckenhafteTage: 0,
  lueckenhafteTageJung: 0,
};

/**
 * @param heute Der heutige Kalendertag in Europe/Berlin. Parameter, nie Uhr — so laesst
 *              sich die Neuberechnung fuer jeden Stichtag wiederholen. [INV-03, INV-04]
 * @param alles Alles neu rechnen und jede Zeile schreiben. Fuer `npm run verify`.
 */
export function berechneNeu(db: DatabaseSync, heute: Tag, alles = false): NeuberechnungErgebnis {
  const transaktionen = repo.transaktion.alle(db);
  const ersterTag = repo.transaktion.ersterTag(db);
  if (ersterTag === null || transaktionen.length === 0) return LEER;
  if (vergleiche(ersterTag, heute) > 0) return LEER;

  const gespeicherteVersion = repo.depotTag.gespeicherteKernVersion(db);

  const marke: Hochwassermarke = {
    letzterBerechneterTag: repo.depotTag.letzterMitVersion(db, KERN_VERSION),
    aeltesteGeaenderteTransaktion: null,
    // Aus der Datenbank nicht ableitbar — siehe Kopfkommentar. Der Hash-Vergleich
    // unten ersetzt diese Angabe vollstaendig.
    aeltesterGeaenderterKurs: null,
    gespeicherteKernVersion: gespeicherteVersion,
    aktuelleKernVersion: KERN_VERSION,
    ersterTag,
  };
  const abMarke = startTagFuerNeuberechnung(marke);
  const versionGesprungen = gespeicherteVersion !== null && gespeicherteVersion !== KERN_VERSION;

  // Kursraster: verschmelzen, dann je ISIN ein Tagesraster ueber die ganze Spanne.
  const punkte: Kurspunkt[] = verschmelzeKurse(repo.kurs.alle(db));
  const jeIsin = new Map<Isin, Kurspunkt[]>();
  for (const p of punkte) {
    const liste = jeIsin.get(p.isin);
    if (liste === undefined) jeIsin.set(p.isin, [p]);
    else liste.push(p);
  }
  const raster = new Map<Isin, ReadonlyMap<Tag, Rasterwert>>();
  for (const [isin, liste] of jeIsin) raster.set(isin, rasterFuer(liste, ersterTag, heute));

  const reihe = baueDepotreihe({ transaktionen, raster, punkteJeIsin: jeIsin, von: ersterTag, bis: heute });

  const berechnetAm = new Date().toISOString();
  let geschrieben = 0;
  let ersterNeuerTag: Tag | null = null;

  inTransaktion(db, () => {
    if (versionGesprungen || alles) {
      // Zeilen einer anderen Kernversion sind nach anderer Logik entstanden. Sie
      // stehen zu lassen hiesse, zwei Rechenweisen in einer Kurve zu mischen.
      repo.depotTag.loescheAlles(db);
    }

    const vorhanden = new Map<Tag, { hash: string; version: number }>();
    if (!versionGesprungen && !alles) {
      for (const t of repo.depotTag.alle(db)) {
        vorhanden.set(t.tag, { hash: t.eingabeHash, version: t.kernVersion });
      }
    }

    for (const zeile of reihe) {
      // Ab der Hochwassermarke wird ohne Vergleich geschrieben — dort ist die
      // Aenderung bekannt. Davor entscheidet der Hash. Beim zweiten identischen Lauf
      // liegt die Marke hinter `heute`, also wird nichts erzwungen und nichts
      // geschrieben: null neu berechnete Tage. [INV-09]
      const erzwungen = vergleiche(zeile.tag, abMarke) >= 0;
      const alt = vorhanden.get(zeile.tag);
      const unveraendert =
        !erzwungen && alt !== undefined && alt.hash === zeile.eingabeHash && alt.version === KERN_VERSION;
      if (unveraendert) continue;

      repo.depotTag.schreibe(db, {
        tag: zeile.tag,
        wertpapiereCent: zeile.wertpapiereCent,
        cashCent: zeile.cashCent,
        gesamtCent: zeile.gesamtCent,
        nettoEinzahlungKumCent: zeile.nettoEinzahlungKumCent,
        lueckenhaft: zeile.lueckenhaft,
        kernVersion: KERN_VERSION,
        eingabeHash: zeile.eingabeHash,
        berechnetAm,
        positionen: zeile.positionen,
      });
      geschrieben += 1;
      if (ersterNeuerTag === null || vergleiche(zeile.tag, ersterNeuerTag) < 0) ersterNeuerTag = zeile.tag;
    }

    // Unbedingt, unabhaengig vom Hash-Vergleich oben: der Server liest die
    // Positionsaufteilung nur vom letzten Tag. Bleibt dessen Summenzeile unveraendert
    // und wird deshalb oben uebersprungen, muss dieser Aufruf trotzdem dafuer sorgen,
    // dass ihr Positionscache nicht auf dem Stand vor dieser Spalte stehen bleibt.
    const letzte = reihe[reihe.length - 1];
    if (letzte !== undefined) repo.depotTag.aktualisierePositionen(db, letzte.tag, letzte.positionen);

    // Tage hinter dem Stichtag koennen nur aus einem frueheren Lauf mit spaeterem
    // `heute` stammen. Sie waeren Zukunft und gehoeren nicht in die Reihe.
    repo.depotTag.loescheAb(db, plusTage(heute, 1));
  });

  return {
    neuBerechneteTage: geschrieben,
    ersterNeuerTag,
    lueckenhafteTage: repo.depotTag.lueckenhafteTage(db),
    lueckenhafteTageJung: repo.depotTag.lueckenhafteTageAb(db, plusTage(heute, -(JUNGE_SPANNE_TAGE - 1))),
  };
}
