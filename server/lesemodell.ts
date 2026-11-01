/**
 * Das Lesemodell: sammelt aus den Repositories, ruft `core/` und gibt Ergebnisobjekte
 * zurueck. Der Server rechnet NICHT — er hat hier keine einzige eigene Formel. Was wie
 * Rechnen aussieht (Fenstergrenzen, Sortierung), ist Auswahl, keine Kennzahl.
 *
 * Der heutige Tag kommt an GENAU EINER Stelle aus der Uhr — `tagAus(new Date()...)`
 * hier unten — und wird als Parameter in `core/` gereicht. `core/` selbst kennt keine
 * Uhr. [INV-04] Ein Kalendertag ist `YYYY-MM-DD` in Europe/Berlin und entsteht
 * ausschliesslich ueber `core/kalender.ts`. [INV-03]
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Konfiguration } from '../shared/konfiguration.ts';
import type { Cent } from '../core/dezimal.ts';
import { wert } from '../core/dezimal.ts';
import { baueDepotreihe, externeFluesse, investitionsFluesse } from '../core/depotreihe.ts';
import type { DriftErgebnis } from '../core/drift.ts';
import { drift } from '../core/drift.ts';
import type { Flussuebersicht } from '../core/fluesse.ts';
import { monatsFluesse } from '../core/fluesse.ts';
import type { Tag } from '../core/kalender.ts';
import { tagAus, vergleiche } from '../core/kalender.ts';
import type { Kennzahlen } from '../core/kennzahlen.ts';
import { berechneKennzahlen } from '../core/kennzahlen.ts';
import type { Kurspunkt, Rasterwert } from '../core/kursraster.ts';
import { letzterKursBis, rasterFuer, verschmelzeKurse } from '../core/kursraster.ts';
import type { LookThroughErgebnis } from '../core/lookthrough.ts';
import { lookThrough, LEERES_ERGEBNIS as LEERER_DURCHBLICK } from '../core/lookthrough.ts';
import type { TwrErgebnis } from '../core/twr.ts';
import { twr } from '../core/twr.ts';
import type { Bestand, Fluss, Isin, Tx } from '../core/typen.ts';
import { ausgeglicheneUebertraege, bewerteAusgaenge } from '../core/uebertraege.ts';
import type { GespeicherterTag, Tagessumme } from '../db/repository/depotTag.ts';
import type { Anbietername } from '../db/repository/fondsAufloesung.ts';
import { FUNDS_JSON_ANBIETER } from '../db/repository/fondsAufloesung.ts';
import type { Lauf } from '../db/repository/lauf.ts';
import type { Sparplan } from '../db/repository/sparplan.ts';
import * as repository from '../db/repository/index.ts';

/**
 * Der gemeldete Cashbestand steht im Schema nirgends eigens — er kommt als Zeile in
 * `bestand` mit der Pseudo-ISIN `CASH` an. Fehlt sie, wird der berechnete Cash als
 * gemeldet angenommen; die Drift-Pruefung sagt dann nichts ueber Cash aus, statt
 * eine Abweichung von 100 % zu erfinden.
 */
export const CASH_ISIN = 'CASH';

export type FehlenderFondsFall = 'gesperrt' | 'abrufGescheitert';

/** Ein gehaltener Fonds, zu dem die Top-25-Kachel keine Bestandteile zeigen kann. */
export type FehlenderFonds = {
  readonly isin: Isin;
  readonly name: string;
  readonly anbieter: Anbietername;
  readonly fall: FehlenderFondsFall;
};

/** Genau einmal auswerten, dann merken. Lebensdauer: diese eine Anfrage. */
function einmal<T>(erzeuge: () => T): () => T {
  let da = false;
  let wertchen: T;
  return () => {
    if (!da) {
      wertchen = erzeuge();
      da = true;
    }
    return wertchen;
  };
}

export type Lesemodell = {
  readonly heute: Tag;
  readonly stand: () => string | null;
  readonly letzterLauf: () => Lauf | null;
  readonly transaktionen: () => readonly Tx[];
  /** Die ganze Reihe — nur fuer Kennzahlen und Verlauf; alles andere braucht `letzterTag`. */
  readonly reihe: () => readonly Tagessumme[];
  readonly letzterTag: () => GespeicherterTag | null;
  readonly externeFluesse: () => readonly Fluss[];
  readonly twr: () => TwrErgebnis;
  readonly ersterTag: () => Tag | null;
  readonly positionswerte: () => ReadonlyMap<Isin, Cent>;
  readonly wertpapierBestand: () => readonly Bestand[];
  readonly gemeldeterCash: () => Cent;
  readonly drift: () => DriftErgebnis;
  readonly kennzahlen: () => Kennzahlen;
  readonly durchblick: () => LookThroughErgebnis;
  readonly fluesse: () => Flussuebersicht;
  readonly sparplaene: () => readonly Sparplan[];
  readonly fehlendeFonds: () => readonly FehlenderFonds[];
  /** ISIN → Wertpapierart (`STOCK`, `ETF`, ...); fehlt eine ISIN, ist die Art unbekannt. */
  readonly arten: () => ReadonlyMap<string, string>;
};

/** Wertpapierzeilen des gemeldeten Bestands — ohne die Cash-Pseudozeile. */
function nurWertpapiere(alle: readonly Bestand[]): Bestand[] {
  return alle.filter((b) => b.isin !== CASH_ISIN);
}

export function baueLesemodell(
  db: DatabaseSync,
  konfiguration: Konfiguration,
  heuteVorgabe?: Tag,
): Lesemodell {
  // Die einzige Stelle im Server, an der die Uhr gelesen wird. [INV-04]
  //
  // `heuteVorgabe` friert diesen Tag ein und wird ausschliesslich von den beiden
  // Startern gesetzt, die ein synthetisches Depot bedienen (`start/demo.ts`,
  // `test/e2e/server-start.ts`): deren Kurshistorie endet an einem festen Tag, und
  // ein `heute` von der Systemuhr schoebe die kurzen Fenster ("1W", "1M") hinter
  // den letzten Datenpunkt — die Kachel zeigte dann ein leeres Diagramm, obwohl
  // Daten da sind. Der echte Start uebergibt nichts und liest die Uhr.
  const heute = heuteVorgabe ?? tagAus(new Date().toISOString());

  const letzterLauf = einmal(() => repository.lauf.letzter(db));
  const stand = einmal(() => repository.lauf.letzterErfolgreicher(db)?.beendet ?? null);

  // Ein Uebertrag hinaus ohne Wert wird hier so bewertet wie in der gespeicherten Reihe,
  // sonst rechneten IZF, TWR und FIFO mit einem anderen Abfluss als die Kurve. [ADR-043]
  const transaktionen = einmal<readonly Tx[]>(() => {
    const roh = repository.transaktion.alle(db);
    return bewerteAusgaenge(roh, ausgeglicheneUebertraege(roh), (isin, tag) =>
      letzterKursBis(verschmelzeKurse(repository.kurs.fuerIsin(db, isin)), tag),
    );
  });
  const reihe = einmal<readonly Tagessumme[]>(() => repository.depotTag.summen(db));
  const letzterTag = einmal(() => repository.depotTag.letzter(db));
  const externe = einmal<readonly Fluss[]>(() =>
    externeFluesse(transaktionen(), ausgeglicheneUebertraege(transaktionen())),
  );
  const twrErgebnis = einmal(() => twr(reihe(), externe()));
  const bestandRoh = einmal<readonly Bestand[]>(() => repository.bestand.alle(db));
  const wertpapierBestand = einmal<readonly Bestand[]>(() => nurWertpapiere(bestandRoh()));
  const sparplaene = einmal<readonly Sparplan[]>(() => repository.sparplan.alle(db));
  const arten = einmal<ReadonlyMap<string, string>>(() => repository.wertpapierArt.alle(db));

  const ersterTag = einmal(() => repository.transaktion.ersterTag(db));

  /**
   * Positionswerte des letzten Tages. Kommt aus dem `positionen_json`-Cache der letzten
   * `depot_tag`-Zeile, den `ingest/neuberechnung.ts` bei jedem Lauf fuellt. Ist er leer —
   * vor dem ersten Lauf nach Einfuehrung dieser Spalte, oder wenn das Depot tatsaechlich
   * komplett in Cash steht — wird die Reihe einmalig ab dem ERSTEN Tag neu gebaut, nie ab
   * einem spaeteren: `baueDepotreihe` beginnt jede Menge bei null und wuesste in einem
   * spaeteren Fenster nichts von frueher gekauften Stuecken.
   */
  const positionswerte = einmal<ReadonlyMap<Isin, Cent>>(() => {
    const letzte = letzterTag();
    if (letzte !== null && letzte.positionen.size > 0) return letzte.positionen;

    const von = ersterTag();
    const bis = letzte?.tag ?? heute;
    if (von === null || vergleiche(von, bis) > 0) return new Map<Isin, Cent>();

    const jeIsin = new Map<Isin, Kurspunkt[]>();
    for (const p of verschmelzeKurse(repository.kurs.alle(db))) {
      const liste = jeIsin.get(p.isin);
      if (liste === undefined) jeIsin.set(p.isin, [p]);
      else liste.push(p);
    }

    const raster = new Map<Isin, ReadonlyMap<Tag, Rasterwert>>();
    for (const [isin, punkte] of jeIsin) raster.set(isin, rasterFuer(punkte, von, bis));

    const gebaut = baueDepotreihe({ transaktionen: transaktionen(), raster, punkteJeIsin: jeIsin, von, bis });
    return gebaut[gebaut.length - 1]?.positionen ?? new Map<Isin, Cent>();
  });

  const gemeldeterCash = einmal<Cent>(() => {
    const zeile = bestandRoh().find((b) => b.isin === CASH_ISIN);
    if (zeile !== undefined) return wert(zeile.mengeE8, zeile.kursE6);
    return letzterTag()?.cashCent ?? 0n;
  });

  const driftErgebnis = einmal(() =>
    drift(
      letzterTag(),
      wertpapierBestand(),
      gemeldeterCash(),
      konfiguration.driftSchwellen,
      positionswerte(),
    ),
  );

  const kennzahlen = einmal(() =>
    berechneKennzahlen({
      transaktionen: transaktionen(),
      reihe: reihe(),
      positionswerte: positionswerte(),
      bestand: wertpapierBestand(),
      vpi: repository.vpi.alsKarte(db),
      zinsreihe: repository.zins.alsKarte(db),
      heute,
      drift: driftErgebnis(),
    }),
  );

  const durchblick = einmal(() => {
    const werte = positionswerte();
    if (werte.size === 0) return LEERER_DURCHBLICK;
    const gesamt = letzterTag()?.gesamtCent ?? 0n;
    const direkt = wertpapierBestand()
      .filter((b) => arten().get(b.isin) === 'STOCK')
      .map((b) => ({ isin: b.isin, name: b.name }));
    return lookThrough(werte, repository.etfBestandteil.aktuelle(db), gesamt, 25, direkt);
  });

  // Kachel 5 zeigt Investitionen in Wertpapiere, nicht externe Zahlungen ins Depot —
  // siehe ADR-008. Die Sparrate in `kennzahlen()` bleibt auf `externeFluesse` gestuetzt.
  const fluesse = einmal(() => monatsFluesse(investitionsFluesse(transaktionen())));

  /**
   * Gehaltene Fonds, von denen die Top-25-Kachel keine Bestandteile zeigen kann — nur,
   * was sich belegen laesst. `durchsicht = 'unbekannt'` zaehlt bewusst nicht mit: `bestand`
   * fuehrt keine Wertpapierart, eine Einzelaktie waere von einem ungeprueften Fonds nicht
   * zu unterscheiden, und die Zahl wuerde mehr behaupten, als bekannt ist.
   *
   * Ein `funds.json`-Eintrag landet nie in `fonds_aufloesung` (die automatische Aufloesung
   * lässt manuell eingetragene ISINs aus) — sein Scheitern steckt nur im Quellenstatus des
   * letzten Laufs, unter demselben `<anbieter>:<isin>`-Schluessel wie ein automatisch
   * aufgeloester Fonds.
   */
  const fehlendeFonds = einmal<readonly FehlenderFonds[]>(() => {
    const aufloesungen = new Map(repository.fondsAufloesung.alle(db).map((a) => [a.isin, a]));
    const quellen = letzterLauf()?.quellen ?? {};
    const ergebnis: FehlenderFonds[] = [];

    for (const b of wertpapierBestand()) {
      const aufloesung = aufloesungen.get(b.isin);
      if (aufloesung !== undefined) {
        if (aufloesung.durchsicht === 'gesperrt' && aufloesung.anbieter !== null) {
          ergebnis.push({ isin: b.isin, name: b.name, anbieter: aufloesung.anbieter, fall: 'gesperrt' });
        } else if (
          aufloesung.durchsicht === 'moeglich' &&
          aufloesung.anbieter !== null &&
          repository.etfBestandteil.neuesterStand(db, b.isin) !== heute
        ) {
          ergebnis.push({ isin: b.isin, name: b.name, anbieter: aufloesung.anbieter, fall: 'abrufGescheitert' });
        }
        continue;
      }

      const treffer = FUNDS_JSON_ANBIETER.find((a) => quellen[`${a}:${b.isin}`] === 'fehler');
      if (treffer !== undefined) {
        ergebnis.push({ isin: b.isin, name: b.name, anbieter: treffer, fall: 'abrufGescheitert' });
      }
    }
    return ergebnis;
  });

  return {
    heute,
    stand,
    letzterLauf,
    transaktionen,
    reihe,
    letzterTag,
    externeFluesse: externe,
    twr: twrErgebnis,
    ersterTag,
    positionswerte,
    wertpapierBestand,
    gemeldeterCash,
    drift: driftErgebnis,
    kennzahlen,
    durchblick,
    fluesse,
    sparplaene,
    fehlendeFonds,
    arten,
  };
}
