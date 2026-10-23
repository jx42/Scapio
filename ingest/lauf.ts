/**
 * Orchestrierung eines Laufs (§6.1) und Einstiegspunkt fuer `npm run ingest`.
 *
 * Die sieben Schritte in genau dieser Reihenfolge, je eine Funktion (`fuehreLaufAus` ist
 * nur die Reihenfolge):
 *
 *   1  Sperre nehmen        — NICHT hier. Das ist Sache von `server/sperre.ts`; wer
 *                             `fuehreLaufAus` ruft, haelt sie bereits. Ein zweites
 *                             Sperrsystem an dieser Stelle waere ein zweites Sperrsystem.
 *   2  lauf-Zeile anlegen (status = laufend)                          `starteLauf`
 *   3  je Quelle in fester Reihenfolge: abrufen, validieren, pruefen, archivieren
 *                                                                     `ernteQuellen` (ernte.ts),
 *                                                                     `pruefePlausibilitaet`
 *   4  Import in EINER Transaktion                          [INV-09]  `importiereUndRechne`
 *   5  Neuberechnung ab der Hochwassermarke                           (ebenda)
 *   6  Selbstkontrolle gegen `bestand`, Stufe bestimmen               `selbstkontrolle`
 *   7  Lauf abschliessen                                               `schliesseLauf`
 *
 * Reihenfolge der Quellen und warum nur `transaktionen` den Lauf beendet: `ernte.ts`.
 *
 * In dieser Datei wird nichts geloggt, was aus einer fremden Antwort stammt. Was ins
 * Protokoll und auf die Konsole geht, sind Quellennamen, Statuswerte, Anzahlen und die
 * selbst formulierten Hinweise — nie Betraege, nie Fremdtext.
 */

import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import type { Cent } from '../core/dezimal.ts';
import { wert } from '../core/dezimal.ts';
import { drift } from '../core/drift.ts';
import type { Tag } from '../core/kalender.ts';
import { istVor, tagAus } from '../core/kalender.ts';
import type { Kurspunkt } from '../core/kursraster.ts';
import { markiereSpruenge } from '../core/kursraster.ts';
import type { Bestand } from '../core/typen.ts';
import * as repo from '../db/repository/index.ts';
import { ladeKonfiguration, logPfad } from '../shared/konfiguration.ts';
import type { Importdaten } from './importieren.ts';
import { importiere } from './importieren.ts';
import { McpSicherung } from './mcp.ts';
import { JUNGE_SPANNE_TAGE } from '../core/kennzahlen.ts';
import { berechneNeu } from './neuberechnung.ts';
import {
  Befunde,
  meldeSpruenge,
  pruefeHistorienbeginn,
  pruefeSummen,
  pruefeUebertraege,
  pruefeVpiReihe,
} from './plausibilitaet.ts';
import { ernteQuellen } from './ernte.ts';
import type { Lauf, LaufErgebnis, LaufOptionen } from './laufZustand.ts';
import { beendeLauf, codeVon, grundVon, schreibeProtokoll } from './laufZustand.ts';
import { Sperre } from '../server/sperre.ts';
import { hinweisKurz } from '../shared/hinweise.ts';

export type { LaufErgebnis, LaufOptionen, QuellenStatus } from './laufZustand.ts';

/**
 * Die Schritte laufen nacheinander; ein Schritt, der den Lauf beenden muss, liefert das
 * `LaufErgebnis`, sonst `null` — dann geht es mit dem naechsten weiter.
 */
export async function fuehreLaufAus(optionen: LaufOptionen): Promise<LaufErgebnis> {
  const lauf = starteLauf(optionen);
  try {
    return (
      (await ernteQuellen(lauf)) ??
      pruefePlausibilitaet(lauf) ??
      importiereUndRechne(lauf) ??
      selbstkontrolle(lauf) ??
      schliesseLauf(lauf)
    );
  } catch (fehler) {
    // Ein Fehler ausserhalb der Schritt-eigenen Fangnetze liesse den Lauf sonst bis zum
    // naechsten Serverstart auf "laufend" stehen.
    lauf.protokoll(`Lauf abgebrochen: ${grundVon(fehler)}`);
    return beendeLauf(lauf, 'fehler', codeVon(fehler));
  }
}

// --- Schritt 2 ---------------------------------------------------------------

function starteLauf({ db, konfiguration, heute, melde }: LaufOptionen): Lauf {
  const jetzt = new Date().toISOString();
  const befunde = new Befunde();
  const laufId = repo.lauf.starte(db, jetzt);
  const protokoll = (zeile: string): void => schreibeProtokoll(konfiguration, `[${String(laufId)}] ${zeile}`);

  return {
    db,
    konfiguration,
    heute,
    jetzt,
    laufId,
    befunde,
    ctx: {
      konfiguration,
      heute,
      jetzt,
      befunde,
      mcp: new McpSicherung(),
      melde: (hinweis) => {
        befunde.uebernimm(hinweis);
        protokoll(`Vorfall: ${hinweisKurz(hinweis)}`);
      },
    },
    quellen: {},
    quellenFehler: new Map(),
    melde,
    protokoll,
    schnappschuesse: [],
    kurspunkte: [],
    etfStaende: [],
    bestaende: null,
    cashCent: null,
    transaktionen: null,
    sparplaene: null,
    fondsAufloesungen: [],
    arten: [],
    vpiWerte: [],
    zinsWerte: [],
    ersterTransaktionsTag: null,
    gemeldeterGesamtwert: null,
    kurseAus: null,
    gesamtAus: null,
    kurse: [],
    neuBerechneteTage: 0,
  };
}

// --- Plausibilitaet, die mehrere Quellen braucht (§6.4) ----------------------

// Eigener try/catch: eine Ausnahme hier (z. B. ein Programmierfehler in einer Pruefung)
// darf den `lauf`-Datensatz nicht auf "laufend" haengen lassen — er muss auch dann
// sauber auf "fehler" enden.
function pruefePlausibilitaet(lauf: Lauf): LaufErgebnis | null {
  const { befunde, bestaende, cashCent, gemeldeterGesamtwert, kurspunkte } = lauf;
  try {
    if (bestaende !== null && cashCent !== null && gemeldeterGesamtwert !== null) {
      const werte = bestaende.map((b) => positionswert(b));
      pruefeSummen(befunde, werte, cashCent, gemeldeterGesamtwert, {
        kurseAus: lauf.kurseAus,
        gesamtAus: lauf.gesamtAus,
        laufAb: lauf.jetzt,
      });
    }
    pruefeHistorienbeginn(befunde, lauf.ersterTransaktionsTag, aeltesterKaufTag(kurspunkte));
    pruefeUebertraege(befunde, lauf.transaktionen ?? []);
    pruefeVpiReihe(befunde, lauf.vpiWerte);

    const auffaellige = markiereSpruenge(kurspunkte);
    const nameVon = new Map((bestaende ?? []).map((b) => [b.isin, b.name] as const));
    meldeSpruenge(befunde, auffaellige, nameVon);
    lauf.kurse = kurspunkte.map((p) => ({
      ...p,
      auffaellig: auffaellige.has(`${p.isin} ${p.tag}`),
    }));
    return null;
  } catch (fehler) {
    lauf.protokoll(`Plausibilitaetspruefung gescheitert: ${grundVon(fehler)}`);
    return beendeLauf(lauf, 'fehler', codeVon(fehler));
  }
}

// --- Schritt 4 und 5: Import in EINER Transaktion, Neuberechnung ---------------

function importiereUndRechne(lauf: Lauf): LaufErgebnis | null {
  const { db, befunde, protokoll } = lauf;
  const daten: Importdaten = {
    bestaende: lauf.bestaende,
    cashCent: lauf.cashCent,
    transaktionen: lauf.transaktionen,
    kurse: lauf.kurse,
    sparplaene: lauf.sparplaene,
    etfStaende: lauf.etfStaende,
    fondsAufloesungen: lauf.fondsAufloesungen,
    arten: lauf.arten,
    vpi: lauf.vpiWerte,
    zins: lauf.zinsWerte,
    schnappschuesse: lauf.schnappschuesse,
  };

  try {
    const bilanz = importiere(db, daten); // [INV-09]
    // Ein Storno ist erlaubt, aber nie stumm: ein Teilverlust unter der Bremse soll auffallen.
    if (bilanz.transaktionenStorniert > 0) {
      befunde.hinweis('storniert', { anzahl: bilanz.transaktionenStorniert });
    }
    protokoll(
      `Import: ${String(bilanz.transaktionenNeu)} neue und ${String(bilanz.transaktionenGeaendert)} geaenderte ` +
        `Transaktionen, ${String(bilanz.kurse)} Kurse, ${String(bilanz.etfBestandteile)} Bestandteile, ` +
        `${String(bilanz.fondsAufloesungen)} Fondsaufloesungen, ${String(bilanz.vpiMonate)} VPI-Monate, ` +
        `${String(bilanz.zinsTage)} Zins-Tage.`,
    );

    const neu = berechneNeu(db, lauf.heute);
    protokoll(
      `Neuberechnung: ${String(neu.neuBerechneteTage)} Tage ab ${neu.ersterNeuerTag ?? '-'}, ` +
        `${String(neu.lueckenhafteTage)} lueckenhaft, davon ${String(neu.lueckenhafteTageJung)} jung.`,
    );
    // Gemeldet wird nur das junge Fenster. Die Gesamtzahl bleibt im Protokoll: sie ist
    // fuer die Fehlersuche nuetzlich, als Hinweis aber nur der immergleiche Altbestand.
    if (neu.lueckenhafteTageJung > 0) {
      befunde.hinweis('kurslueckenJung', { tage: neu.lueckenhafteTageJung, spanne: JUNGE_SPANNE_TAGE });
    }
    // Zuletzt: ein Abbruch oben meldet 0 Tage, wie bevor der Lauf diese Stufe erreichte.
    lauf.neuBerechneteTage = neu.neuBerechneteTage;
    return null;
  } catch (fehler) {
    protokoll(`Import oder Neuberechnung gescheitert: ${grundVon(fehler)}`);
    return beendeLauf(lauf, 'fehler', codeVon(fehler));
  }
}

// --- Schritt 6: Selbstkontrolle ----------------------------------------------

// Wie oben: eine gescheiterte Selbstkontrolle beendet den Lauf sauber statt den
// `lauf`-Datensatz auf "laufend" zu belassen. `neuBerechneteTage` ist zu diesem
// Zeitpunkt schon geschrieben und bleibt daher erhalten, anders als bei einer
// gescheiterten Plausibilitaetspruefung, die vor der Neuberechnung liegt.
function selbstkontrolle(lauf: Lauf): LaufErgebnis | null {
  try {
    // Ohne Cash verglichen, laege das berechnete Gesamt (mit Cash) gegen die gemeldeten
    // Wertpapiere allein — ein Drift in Hoehe des Cash-Anteils, den es nicht gibt.
    if (lauf.cashCent === null) {
      lauf.protokoll('Selbstkontrolle: ausgesetzt (Cash fehlt)');
      return null;
    }
    const letzter = repo.depotTag.letzter(lauf.db);
    // Ohne 5. Argument `positionen`, anders als der zweite Aufrufer
    // (`server/lesemodell.ts`, dort mit `positionswerte()`): der ist ein Lesemodell fuer
    // die Oberflaeche und haelt die Aufschluesselung je Position ohnehin schon vor, hier
    // dient `drift()` nur der Selbstkontrolle des Laufs und braucht keine Aufschluesselung.
    const kontrolle = drift(letzter, lauf.bestaende ?? [], lauf.cashCent, lauf.konfiguration.driftSchwellen);
    if (kontrolle.stufe !== 'ok' && kontrolle.stufe !== 'ausgesetzt' && kontrolle.stufe !== 'leer') {
      lauf.befunde.hinweis('selbstkontrolle', { stufe: kontrolle.stufe, abweichungProzent: kontrolle.abweichung * 100 });
    }
    lauf.protokoll(`Selbstkontrolle: ${kontrolle.stufe}`);
    return null;
  } catch (fehler) {
    lauf.protokoll(`Selbstkontrolle gescheitert: ${grundVon(fehler)}`);
    return beendeLauf(lauf, 'fehler', codeVon(fehler));
  }
}

// --- Schritt 7: Lauf abschliessen --------------------------------------------

function schliesseLauf(lauf: Lauf): LaufErgebnis {
  const gescheitert = Object.values(lauf.quellen).filter((s) => s === 'fehler').length;
  const status = gescheitert === 0 ? 'erfolg' : 'teilweise';

  // Die zwei Codes, die der Nutzer beheben bzw. abwarten kann, heben den Lauf ueber
  // "teilweise" hinaus sichtbar — Anmeldung zuerst, sie verlangt eine Handlung.
  const codes = new Set(lauf.quellenFehler.values());
  const code = ['E_MCP_ANMELDUNG', 'E_MCP_DROSSEL'].find((c) => codes.has(c)) ?? null;
  return beendeLauf(lauf, status, code);
}

// ---------------------------------------------------------------------------

function positionswert(b: Bestand): Cent {
  // `wert` rundet einmal, am Ende — die einzige erlaubte Stelle. [INV-02]
  return wert(b.mengeE8, b.kursE6);
}

/** Aeltester Tag, an dem ein Kauf einen Kurs erzeugt hat. Grundlage der letzten Prueftabellenzeile. */
function aeltesterKaufTag(punkte: readonly Kurspunkt[]): Tag | null {
  let aeltester: Tag | null = null;
  for (const p of punkte) {
    if (p.herkunft !== 'transaktion') continue;
    if (aeltester === null || istVor(p.tag, aeltester)) aeltester = p.tag; // [INV-03]
  }
  return aeltester;
}

// ---------------------------------------------------------------------------
// Einstiegspunkt fuer `npm run ingest`
// ---------------------------------------------------------------------------

/**
 * Direkter Aufruf, ausschliesslich fuer die Fehlersuche. Der normale Weg ist
 * `POST /api/refresh`, weil dort die Sperre sitzt. Wer diese Datei von Hand startet,
 * sollte sicher sein, dass der Server gerade nicht laeuft.
 */
export async function main(): Promise<void> {
  const konfiguration = ladeKonfiguration();

  // Dieselbe Sperre wie `POST /api/refresh` — ohne sie koennten dieser Direktaufruf und
  // der Server gleichzeitig in dieselbe Datenbank schreiben. `server/fehler.ts` wird
  // bewusst nicht importiert: der Fehler wird unten anhand seiner Felder erkannt, nicht
  // per `instanceof ApiFehler`.
  const sperre = new Sperre(konfiguration.datenpfad);
  try {
    sperre.nimm('ingest');
  } catch (fehler) {
    const hinweis =
      typeof fehler === 'object' && fehler !== null && 'hinweis' in fehler && typeof fehler.hinweis === 'string'
        ? fehler.hinweis
        : fehler instanceof Error
          ? fehler.message
          : 'Unbekannter Fehler.';
    console.error(`Sperre nicht erhalten: ${hinweis}`);
    console.error('Siehe docs/RUNBOOK.md.');
    process.exitCode = 1;
    return;
  }

  // Alles ab hier gehoert in den try: die Sperre ist genommen, und `oeffneDatenbank` wirft
  // bei einer zu neuen Datenbank oder einer gescheiterten Migration. Sonst bliebe die
  // Sperrdatei liegen und der naechste Ingest meldete einen Lauf, den es nicht gibt.
  let db: DatabaseSync | null = null;
  try {
    const { oeffneDatenbank } = await import('../db/verbindung.ts');
    try {
      db = await oeffneDatenbank({ konfiguration });
    } catch (fehler) {
      // Eigene Saetze (Datenbank zu neu, Migration gescheitert) — noch kein Fremdtext im Spiel.
      console.error(`Die Datenbank laesst sich nicht oeffnen: ${fehler instanceof Error ? fehler.message : 'Unbekannter Fehler.'}`);
      console.error('Siehe docs/RUNBOOK.md.');
      process.exitCode = 1;
      return;
    }
    const heute = tagAus(new Date().toISOString());

    const ergebnis = await fuehreLaufAus({
      db,
      konfiguration,
      heute,
      melde: (quelle, status) => {
        console.log(`  ${quelle.padEnd(28)} ${status}`);
      },
    });

    console.log(`\nLauf ${String(ergebnis.laufId)}: ${ergebnis.status}`);
    console.log(`Neu berechnete Tage: ${String(ergebnis.neuBerechneteTage)}`);
    if (ergebnis.fehlerCode !== null) console.log(`Fehlercode: ${ergebnis.fehlerCode}`);
    for (const h of ergebnis.hinweise) console.log(`Hinweis: ${hinweisKurz(h)}`);

    process.exitCode = ergebnis.status === 'erfolg' ? 0 : ergebnis.status === 'teilweise' ? 2 : 1;
  } catch (fehler) {
    // Auf die Konsole nur der Code: die Meldung kann Fremdtext tragen [ADR-042]. Der Wortlaut
    // steht im lokalen Protokoll.
    const code = typeof fehler === 'object' && fehler !== null && 'code' in fehler && typeof fehler.code === 'string'
      ? fehler.code
      : fehler instanceof Error ? fehler.name : 'E_UNBEKANNT';
    schreibeProtokoll(konfiguration, `Ingest gescheitert: ${fehler instanceof Error ? fehler.message : String(fehler)}`);
    console.error(`Der Ingest ist gescheitert: ${code}. Wortlaut in ${logPfad(konfiguration)}.`);
    console.error('Siehe docs/RUNBOOK.md.');
    process.exitCode = 1;
  } finally {
    db?.close();
    sperre.gibFrei();
  }
}

// `import.meta.main` gibt es erst ab Node 24.1; der Vergleich mit argv[1] geht immer.
const direktGestartet =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (direktGestartet) {
  await main();
}
