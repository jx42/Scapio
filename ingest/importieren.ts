/**
 * Validierung → Plausibilitaet → atomarer Import.
 *
 * Der gesamte Schreibvorgang laeuft in EINER Transaktion [INV-09]. Ein Lauf, der auf
 * halber Strecke abbricht, hinterlaesst eine Datenbank, die aussieht wie vorher — nicht
 * eine, in der die Kurse neu und die Transaktionen alt sind. Genau diese Mischung wuerde
 * eine falsche Rendite ergeben, die niemandem auffaellt.
 *
 * Idempotenz ist die zweite Haelfte von [INV-09]: derselbe Lauf zweimal ergibt denselben
 * Inhalt und NULL neu berechnete Tage. Der Stolperstein dabei ist `transaktion.gesehen_am`
 * — es steuert `aeltesteAenderungSeit` und damit die Hochwassermarke. Wuerden wir jede
 * Zeile blind neu schreiben, waere nach jedem Lauf jede Transaktion "geaendert" und die
 * ganze Historie neu zu rechnen. Deshalb wird hier VERGLICHEN und nur geschrieben, was
 * sich tatsaechlich unterscheidet.
 *
 * Hier steht auch der gemeinsame Kontext der Quellen — sie brauchen alle dieselben vier
 * Dinge (Konfiguration, heutiger Tag, Zeitstempel, Befundsammler) und sonst nichts.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Cent } from '../core/dezimal.ts';
import type { Tag } from '../core/kalender.ts';
import type { Bestandteil } from '../core/lookthrough.ts';
import type { Bestand, Isin, Tx } from '../core/typen.ts';
import type { Aufloesung } from '../db/repository/fondsAufloesung.ts';
import type { Wertpapierart } from '../db/repository/wertpapierArt.ts';
import type { NeuerKurs } from '../db/repository/kurs.ts';
import type { Sparplan } from '../db/repository/sparplan.ts';
import type { NeueTx } from '../db/repository/transaktion.ts';
import type { Vpiwert } from '../db/repository/vpi.ts';
import type { Zinswert } from '../db/repository/zins.ts';
import * as repo from '../db/repository/index.ts';
import { inTransaktion } from '../db/repository/index.ts';
import type { Konfiguration } from '../shared/konfiguration.ts';
import type { Hinweis } from '../shared/hinweise.ts';
import type { McpSicherung } from './mcp.ts';
import type { Befunde } from './plausibilitaet.ts';
import type { LaufFehlerCode } from '../shared/laufFehler.ts';

/** Was jede Quelle braucht. Keine Datenbank — Quellen holen und pruefen, sie schreiben nicht. */
export type Kontext = {
  readonly konfiguration: Konfiguration;
  /** Heutiger Kalendertag in Europe/Berlin. [INV-03] */
  readonly heute: Tag;
  /** Zeitpunkt des Laufs, ISO 8601 mit Offset — geht als `stand` und `gesehen_am` mit. */
  readonly jetzt: string;
  readonly befunde: Befunde;
  /** Fuer Vorfaelle. Nie fuer Nutzdaten. */
  readonly melde?: (hinweis: Hinweis) => void;
  /** Laufweiter Kurzschluss fuer alle MCP-Quellen. [ADR-031] */
  readonly mcp?: McpSicherung;
};

/** Was eine Quelle zurueckgibt: die geprueften Daten und die Rohantwort fuers Archiv. */
export type Ernte<T> = {
  readonly daten: T;
  /** Name in `raw_snapshot.quelle` — `holdings`, `transaktionen`, `kurse:<isin>`, … */
  readonly quelle: string;
  readonly rohJson: string;
};

export type Schnappschuss = {
  readonly quelle: string;
  readonly abgerufenAm: string;
  readonly payloadJson: string;
};

export type EtfStand = {
  readonly fondsIsin: Isin;
  readonly stand: string;
  readonly teile: readonly Bestandteil[];
};

/**
 * Alles, was ein Lauf geerntet hat. `null` heisst: die Quelle ist gescheitert und der
 * alte Stand bleibt stehen — ein leeres Array wuerde ihn loeschen. Der Unterschied
 * ist der Grund, warum diese Felder nullbar sind. [P-08]
 */
export type Importdaten = {
  readonly bestaende: readonly Bestand[] | null;
  readonly cashCent: Cent | null;
  readonly transaktionen: readonly NeueTx[] | null;
  readonly kurse: readonly NeuerKurs[];
  readonly sparplaene: readonly Sparplan[] | null;
  readonly etfStaende: readonly EtfStand[];
  readonly fondsAufloesungen: readonly Aufloesung[];
  readonly arten: readonly Wertpapierart[];
  readonly vpi: readonly Vpiwert[];
  readonly zins: readonly Zinswert[];
  readonly schnappschuesse: readonly Schnappschuss[];
};

export type Importbilanz = {
  readonly transaktionenNeu: number;
  readonly transaktionenGeaendert: number;
  /** Davon als "von der Bank nicht mehr geliefert" storniert — Teilmenge von `transaktionenGeaendert`. */
  readonly transaktionenStorniert: number;
  readonly kurse: number;
  readonly bestaende: number;
  readonly sparplaene: number;
  readonly etfBestandteile: number;
  readonly fondsAufloesungen: number;
  readonly vpiMonate: number;
  readonly zinsTage: number;
  readonly schnappschuesse: number;
};

/**
 * Die Felder, an denen der Vergleich haengt: alles an `Tx` ausser dem Schluessel `id`.
 * `gesehenAm` gehoert bewusst nicht dazu — es ist das Ergebnis des Vergleichs, nicht sein
 * Gegenstand.
 *
 * Die Liste steht als Objekt und nicht als `&&`-Kette, damit `satisfies` sie vollstaendig
 * haelt: fehlt ein Feld, scheitert der Typcheck. Eine handgepflegte Kette tut das nicht,
 * und das ist einmal teuer geworden — `bezugIsin` fehlte darin, also galt jede bestehende
 * Zeile als unveraendert, und die neue Spalte blieb bei allen 374 Transaktionen NULL,
 * obwohl die Bank den Wert in jeder Antwort mitlieferte. Sichtbar wurde es erst in der
 * Oberflaeche, wo jede Steuerbuchung "ohne Angabe" zeigte.
 */
const VERGLICHENE_FELDER = {
  ts: true,
  tag: true,
  art: true,
  typ: true,
  isin: true,
  bezugIsin: true,
  mengeE8: true,
  betragCent: true,
  beschreibung: true,
  status: true,
  istExtern: true,
  storniert: true,
} satisfies Record<Exclude<keyof Tx, 'id'>, true>;

/** Vergleich Feld fuer Feld. `gesehen_am` gehoert bewusst NICHT dazu. */
function gleich(a: Tx, b: NeueTx): boolean {
  for (const feld of Object.keys(VERGLICHENE_FELDER) as (keyof typeof VERGLICHENE_FELDER)[]) {
    if (a[feld] !== b[feld]) return false;
  }
  return true;
}

/**
 * Storno-Bremse: Schutz gegen eine unvollstaendige Transaktionsliste, die als vollstaendige
 * durchgeht (etwa durch einen stillen Seitenverlust in `mcp.ts`, bevor Bug 1 behoben wurde,
 * oder eine leere/kaum gefuellte MCP-Antwort). Ohne diese Bremse haette eine solche Liste
 * fast den gesamten Bestand als "von der Bank nicht mehr geliefert" storniert. Der Anteil
 * allein reicht nicht: bei einem grossen Bestand verschwaende ein Teilverlust unter 50 %
 * unbemerkt. Deshalb zwei Wege in die Bremse: viele UND ueber die Haelfte (kleine Depots,
 * wo ein einzelnes echtes Storno leicht ueber 50 % liegt, bleiben frei) — oder ueber der
 * absoluten Obergrenze, egal wie gross der Bestand ist.
 */
const STORNO_BREMSE_ABSOLUT = 20;
const STORNO_BREMSE_ANTEIL = 0.5;
const STORNO_BREMSE_OBERGRENZE = 50;

/** Eigener Code, damit der Lauf ihn im Protokoll und in `lauf.fehler_code` nennt statt `E_UNBEKANNT`. */
export class StornoBremse extends Error {
  readonly code = 'E_STORNO_BREMSE' satisfies LaufFehlerCode;
  constructor(verschwunden: number, bekannt: number) {
    super(
      `Storno-Bremse: ${String(verschwunden)} von ${String(bekannt)} bekannten Transaktionen ` +
        'wuerden storniert — das sieht nach einem Abruffehler aus, nicht nach echten Stornierungen.',
    );
    this.name = 'StornoBremse';
  }
}

/**
 * Schreibt alles in EINER Transaktion. Der Aufrufer haelt die Sperre; diese Funktion
 * kennt sie nicht. Wirft sie, hat sich an der Datenbank nichts geaendert.
 */
export function importiere(db: DatabaseSync, daten: Importdaten): Importbilanz {
  return inTransaktion(db, () => {
    let neu = 0;
    let geaendert = 0;
    let storniert = 0;

    if (daten.transaktionen !== null) {
      const vorhanden = new Map<string, Tx>();
      for (const tx of repo.transaktion.alle(db)) vorhanden.set(tx.id, tx);

      const zuSchreiben: NeueTx[] = [];
      for (const tx of daten.transaktionen) {
        const alt = vorhanden.get(tx.id);
        if (alt === undefined) {
          zuSchreiben.push(tx);
          neu += 1;
        } else if (!gleich(alt, tx)) {
          zuSchreiben.push(tx);
          geaendert += 1;
        }
      }
      repo.transaktion.schreibeViele(db, zuSchreiben);

      /*
       * Eine Transaktion, die die Bank nicht mehr liefert, wird als storniert markiert
       * statt geloescht — sonst verschwindet sie stillschweigend aus jeder Rendite, und
       * `raw_snapshot` wuerde eine Historie zeigen, die die Datenbank nicht mehr kennt.
       */
      const geliefert = new Set(daten.transaktionen.map((t) => t.id));
      const verschwunden = [...vorhanden.keys()].filter(
        (id) => !geliefert.has(id) && !id.startsWith('seed:') && vorhanden.get(id)?.storniert !== true,
      );
      if (verschwunden.length > 0) {
        if (
          verschwunden.length > STORNO_BREMSE_OBERGRENZE ||
          (verschwunden.length > STORNO_BREMSE_ABSOLUT &&
            verschwunden.length > vorhanden.size * STORNO_BREMSE_ANTEIL)
        ) {
          throw new StornoBremse(verschwunden.length, vorhanden.size);
        }
        storniert = repo.transaktion.markiereStorniert(db, verschwunden);
        geaendert += storniert;
      }
    }

    const kurse = daten.kurse.length > 0 ? repo.kurs.schreibeViele(db, daten.kurse) : 0;

    const bestaende = daten.bestaende !== null ? repo.bestand.ersetze(db, daten.bestaende) : 0;
    const sparplaene = daten.sparplaene !== null ? repo.sparplan.ersetze(db, daten.sparplaene) : 0;

    let teile = 0;
    for (const s of daten.etfStaende) {
      teile += repo.etfBestandteil.ersetzeFuerStand(db, s.fondsIsin, s.stand, s.teile);
      // Zwei Staende je Fonds genuegen: der aktuelle und der davor, falls ein Abruf halb misslingt.
      repo.etfBestandteil.alteStaendeEntfernen(db, s.fondsIsin, 2);
    }

    for (const a of daten.fondsAufloesungen) repo.fondsAufloesung.setze(db, a);
    for (const a of daten.arten) repo.wertpapierArt.setze(db, a);

    const vpiMonate = daten.vpi.length > 0 ? repo.vpi.schreibeViele(db, daten.vpi) : 0;
    const zinsTage = daten.zins.length > 0 ? repo.zins.schreibeViele(db, daten.zins) : 0;

    for (const s of daten.schnappschuesse) {
      repo.rawSnapshot.schreibe(db, s.quelle, s.abgerufenAm, s.payloadJson);
      // `npm run verify` rechnet aus den Rohantworten neu — deshalb bleibt eine
      // Handvoll stehen, nicht nur die letzte.
      repo.rawSnapshot.aeltereEntfernen(db, s.quelle, 10);
    }

    return {
      transaktionenNeu: neu,
      transaktionenGeaendert: geaendert,
      transaktionenStorniert: storniert,
      kurse,
      bestaende,
      sparplaene,
      etfBestandteile: teile,
      fondsAufloesungen: daten.fondsAufloesungen.length,
      vpiMonate,
      zinsTage,
      schnappschuesse: daten.schnappschuesse.length,
    };
  });
}
