/**
 * INV-09 — Jeder Import ist atomar und idempotent.
 *
 * Atomar: bricht ein Lauf in der Mitte ab — Netz weg, Prozess getoetet —, steht die
 * Datenbank danach so da wie davor. Ein halb geschriebener Lauf waere schlimmer als gar
 * keiner, weil man ihm nicht ansieht, dass er halb ist.
 *
 * Idempotent: derselbe Lauf zweimal ergibt denselben Zustand. Ohne das waechst die
 * Datenbank bei jedem Abruf, und jede Kennzahl zaehlt dieselben Kaeufe doppelt.
 */

import { describe, expect, it } from 'vitest';
import { zuCent, zuKursE6, zuMengeE8 } from '../../core/dezimal.ts';
import { alsTag } from '../../core/kalender.ts';
import * as repo from '../../db/repository/index.ts';
import { importiere } from '../../ingest/importieren.ts';
import type { Importdaten } from '../../ingest/importieren.ts';
import type { DatabaseSync } from 'node:sqlite';
import { testDatenbank } from '../../db/verbindung.ts';
import { WELT } from '../hilfen.ts';
import { dateien, sucheImCode } from './quellen.ts';

const JETZT = '2026-08-26T18:00:00+02:00';

function daten(teil: Partial<Importdaten> = {}): Importdaten {
  return {
    bestaende: [{ isin: WELT, name: 'Welt', mengeE8: zuMengeE8('4'), kursE6: zuKursE6('100'), stand: JETZT }],
    cashCent: zuCent('250'),
    transaktionen: [
      {
        id: 'bank-1',
        ts: '2026-01-05T10:00:00+01:00',
        tag: alsTag('2026-01-05'),
        art: 'CASH',
        typ: 'CASH_TRANSFER_IN',
        isin: null,
        bezugIsin: null,
        mengeE8: null,
        betragCent: zuCent('1000'),
        beschreibung: 'Einzahlung',
        status: 'EXECUTED',
        istExtern: true,
        storniert: false,
        gesehenAm: JETZT,
      },
      {
        id: 'bank-2',
        ts: '2026-01-06T10:00:00+01:00',
        tag: alsTag('2026-01-06'),
        art: 'WERTPAPIER',
        typ: 'BUY',
        isin: WELT,
        bezugIsin: null,
        mengeE8: zuMengeE8('4'),
        betragCent: -zuCent('400'),
        beschreibung: 'Kauf',
        status: 'EXECUTED',
        istExtern: false,
        storniert: false,
        gesehenAm: JETZT,
      },
    ],
    kurse: [{ isin: WELT, tag: alsTag('2026-01-06'), kurs: zuKursE6('100'), herkunft: 'transaktion' }],
    sparplaene: [
      { isin: WELT, name: 'Welt', betragCent: zuCent('100'), frequenz: 'MONTHLY', tagImMonat: 1, naechsteAusfuehrung: null, stand: JETZT },
    ],
    etfStaende: [
      {
        fondsIsin: WELT,
        stand: '2026-08-25',
        teile: [{ fondsIsin: WELT, unternehmenIsin: 'US0378331005', name: 'Apple', gewicht: 0.05, sektor: 'IT', land: 'US' }],
      },
    ],
    fondsAufloesungen: [],
    arten: [],
    vpi: [{ monat: '2026-01', indexWert: 120.5, quelle: 'eurostat' }],
    zins: [{ tag: '2026-01-05', zinsProJahr: -0.0055, quelle: 'ezb:EST' }],
    schnappschuesse: [{ quelle: 'holdings', abgerufenAm: JETZT, payloadJson: '{"a":1}' }],
    ...teil,
  };
}

/**
 * Der abgeleitete Zustand: alles, woraus der Rechenkern spaeter Zahlen macht.
 *
 * `raw_snapshot` steht bewusst NICHT darin. Das Archiv ist ein Journal, kein Zustand —
 * `npm run verify` rechnet die Historie daraus neu und braucht dafuer mehr als die
 * letzte Antwort. Dass es bei jedem Lauf um eine Zeile waechst, ist der Zweck der
 * Tabelle und keine Verletzung von INV-09; der eigene Test unten deckelt sie.
 */
function zustand(db: DatabaseSync) {
  return {
    transaktionen: repo.transaktion.alle(db).length,
    kurse: repo.kurs.isins(db).length,
    bestaende: repo.bestand.alle(db).length,
    sparplaene: repo.sparplan.alle(db).length,
    bestandteile: repo.etfBestandteil.aktuelle(db).length,
    vpi: repo.vpi.alle(db).length,
    zins: repo.zins.alle(db).length,
  };
}

describe('INV-09 — idempotent', () => {
  it('aendert beim zweiten Lauf mit denselben Daten nichts', async () => {
    const db = await testDatenbank();
    const ersteBilanz = importiere(db, daten());
    const nachEins = zustand(db);

    const zweiteBilanz = importiere(db, daten());
    const nachZwei = zustand(db);

    expect(nachZwei).toEqual(nachEins);
    expect(ersteBilanz.transaktionenNeu).toBe(2);
    expect(zweiteBilanz.transaktionenNeu, 'Der zweite Lauf haelt dieselbe Transaktion fuer neu').toBe(0);
    expect(zweiteBilanz.transaktionenGeaendert).toBe(0);
  });

  it('bleibt auch nach fuenf Laeufen bei denselben Zahlen', async () => {
    const db = await testDatenbank();
    importiere(db, daten());
    const nachEins = zustand(db);
    for (let i = 0; i < 4; i += 1) importiere(db, daten());
    expect(zustand(db)).toEqual(nachEins);
  });

  it('erkennt eine geaenderte Transaktion als geaendert, nicht als neu', async () => {
    const db = await testDatenbank();
    importiere(db, daten());

    const geaendert = daten();
    const zweite = [...(geaendert.transaktionen ?? [])];
    zweite[1] = { ...zweite[1]!, betragCent: -zuCent('401') };
    const bilanz = importiere(db, { ...geaendert, transaktionen: zweite });

    expect(bilanz.transaktionenNeu).toBe(0);
    expect(bilanz.transaktionenGeaendert).toBe(1);
    expect(repo.transaktion.alle(db)).toHaveLength(2);
    expect(repo.transaktion.alle(db).find((t) => t.id === 'bank-2')?.betragCent).toBe(-zuCent('401'));
  });

  /*
   * Der Vergleich in `gleich` entscheidet, ob eine bestehende Zeile ueberhaupt neu
   * geschrieben wird. Fehlt darin ein Feld, kommt ein nachtraeglich ergaenzter Wert nie
   * in der Datenbank an — bei `bezugIsin` blieb die Spalte deshalb dauerhaft NULL.
   */
  it('erkennt ein nachgeliefertes bezugIsin als Aenderung', async () => {
    const db = await testDatenbank();
    importiere(db, daten());

    const mitBezug = daten();
    const txs = [...(mitBezug.transaktionen ?? [])];
    txs[0] = { ...txs[0]!, bezugIsin: WELT };
    const bilanz = importiere(db, { ...mitBezug, transaktionen: txs });

    expect(bilanz.transaktionenGeaendert).toBe(1);
    expect(repo.transaktion.alle(db).find((t) => t.id === 'bank-1')?.bezugIsin).toBe(WELT);
  });

  it('storniert eine verschwundene Transaktion, statt sie zu loeschen', async () => {
    const db = await testDatenbank();
    importiere(db, daten());
    const nurEine = (daten().transaktionen ?? []).slice(0, 1);
    importiere(db, { ...daten(), transaktionen: nurEine });

    const alle = repo.transaktion.alle(db);
    expect(alle, 'Eine Transaktion ist verschwunden statt storniert').toHaveLength(2);
    expect(alle.find((t) => t.id === 'bank-2')?.storniert).toBe(true);
  });

  it('laesst einen alten Stand stehen, wenn eine Quelle gescheitert ist', async () => {
    // `null` heisst "nicht abgerufen", ein leeres Array hiesse "es gibt nichts mehr".
    const db = await testDatenbank();
    importiere(db, daten());
    importiere(db, { ...daten(), bestaende: null, sparplaene: null, transaktionen: null });

    expect(repo.bestand.alle(db)).toHaveLength(1);
    expect(repo.sparplan.alle(db)).toHaveLength(1);
    expect(repo.transaktion.alle(db)).toHaveLength(2);
  });

  it('haelt das Rohantwort-Archiv bei zehn Eintraegen je Quelle', async () => {
    // Das Archiv waechst mit jedem Lauf — es ist die Grundlage von `npm run verify`.
    // Unbegrenzt waechst es aber nicht: nach zwoelf Laeufen stehen zehn Antworten da.
    const db = await testDatenbank();
    for (let i = 0; i < 12; i += 1) importiere(db, daten());
    expect(repo.rawSnapshot.alleFuer(db, 'holdings')).toHaveLength(10);
  });

  it('loescht den Bestand, wenn die Bank wirklich nichts mehr meldet', async () => {
    const db = await testDatenbank();
    importiere(db, daten());
    importiere(db, { ...daten(), bestaende: [] });
    expect(repo.bestand.alle(db)).toHaveLength(0);
  });
});

function bankTransaktionen(anzahl: number) {
  return Array.from({ length: anzahl }, (_, i) => ({
    id: `bank-${String(i)}`,
    ts: '2026-01-05T10:00:00+01:00',
    tag: alsTag('2026-01-05'),
    art: 'CASH' as const,
    typ: 'CASH_TRANSFER_IN' as const,
    isin: null,
    bezugIsin: null,
    mengeE8: null,
    betragCent: zuCent('10'),
    beschreibung: 'Einzahlung',
    status: 'EXECUTED' as const,
    istExtern: true,
    storniert: false,
    gesehenAm: JETZT,
  }));
}

describe('INV-09 — atomar', () => {
  it('laesst nichts stehen, wenn der Import in der Mitte scheitert', async () => {
    const db = await testDatenbank();

    // Die Transaktionen kommen zuerst, die Schnappschuesse zuletzt. Ein Fehler im
    // letzten Schritt muss auch den ersten zuruecknehmen.
    const kaputt = daten({
      schnappschuesse: [{ quelle: 'holdings', abgerufenAm: JETZT, payloadJson: null as unknown as string }],
    });

    expect(() => importiere(db, kaputt)).toThrow();
    expect(zustand(db)).toEqual({
      transaktionen: 0,
      kurse: 0,
      bestaende: 0,
      sparplaene: 0,
      bestandteile: 0,
      vpi: 0,
      zins: 0,
    });
    expect(repo.rawSnapshot.alleFuer(db, 'holdings')).toHaveLength(0);
  });

  it('nimmt einen gescheiterten zweiten Lauf zurueck, ohne den ersten zu beschaedigen', async () => {
    const db = await testDatenbank();
    importiere(db, daten());
    const vorher = zustand(db);

    expect(() =>
      importiere(db, daten({ schnappschuesse: [{ quelle: 'x', abgerufenAm: JETZT, payloadJson: null as unknown as string }] })),
    ).toThrow();

    expect(zustand(db)).toEqual(vorher);
    expect(repo.transaktion.alle(db).find((t) => t.id === 'bank-2')?.storniert).toBe(false);
  });

  it('Storno-Bremse: verweigert eine Massenstornierung statt sie stumm durchzufuehren', async () => {
    // Simuliert eine unvollstaendige Transaktionsliste (etwa durch einen stillen
    // Seitenverlust) statt echter Stornierungen: 25 von 26 bekannten Transaktionen
    // fehlen in der neuen Liste. Ohne Bremse waeren 25 davon als "storniert" markiert
    // worden.
    const db = await testDatenbank();
    const viele = daten({
      transaktionen: Array.from({ length: 26 }, (_, i) => ({
        id: `bank-${String(i)}`,
        ts: '2026-01-05T10:00:00+01:00',
        tag: alsTag('2026-01-05'),
        art: 'CASH' as const,
        typ: 'CASH_TRANSFER_IN' as const,
        isin: null,
        bezugIsin: null,
        mengeE8: null,
        betragCent: zuCent('10'),
        beschreibung: 'Einzahlung',
        status: 'EXECUTED' as const,
        istExtern: true,
        storniert: false,
        gesehenAm: JETZT,
      })),
    });
    importiere(db, viele);
    const vorher = zustand(db);

    expect(() => importiere(db, { ...viele, transaktionen: viele.transaktionen!.slice(0, 1) })).toThrow(
      /Storno-Bremse/,
    );

    expect(zustand(db)).toEqual(vorher);
    expect(repo.transaktion.alle(db).filter((t) => t.storniert)).toHaveLength(0);
  });

  it('Storno-Bremse: greift auch unter 50 %, wenn absolut zu viele verschwinden', async () => {
    // 80 von 200 (40 %) sind weder klein noch die Mehrheit — der Anteil allein liesse sie durch.
    const db = await testDatenbank();
    const viele = daten({ transaktionen: bankTransaktionen(200) });
    importiere(db, viele);
    const vorher = zustand(db);

    expect(() => importiere(db, { ...viele, transaktionen: viele.transaktionen!.slice(80) })).toThrow(
      /Storno-Bremse/,
    );

    expect(zustand(db)).toEqual(vorher);
    expect(repo.transaktion.alle(db).filter((t) => t.storniert)).toHaveLength(0);
  });

  it('Storno-Bremse: laesst einen kleinen Teilverlust durch und zaehlt ihn in der Bilanz', async () => {
    // 30 von 100 (30 %): unter Obergrenze und unter der Haelfte. Storniert wird — aber
    // `transaktionenStorniert` haelt es fuer den Hinweis im Lauf fest.
    const db = await testDatenbank();
    const viele = daten({ transaktionen: bankTransaktionen(100) });
    importiere(db, viele);

    const bilanz = importiere(db, { ...viele, transaktionen: viele.transaktionen!.slice(30) });

    expect(bilanz.transaktionenStorniert).toBe(30);
    expect(repo.transaktion.alle(db).filter((t) => t.storniert)).toHaveLength(30);
  });

  it('schreibt nur aus Dateien, die eine Transaktion aufmachen', () => {
    // Zwei Stellen schreiben: `importiere` uebernimmt den Lauf, `neuberechnung`
    // schreibt die gerechnete Historie. Beide sind fuer sich atomar — die zweite
    // darf nicht in der ersten stecken, sonst haelt eine lange Rechnung die
    // Schreibsperre der Datenbank. Jede von ihnen muss `inTransaktion` benutzen.
    const ingest = dateien(['ingest']);
    const schreibend = new Set(sucheImCode(ingest, /repo\s*\.\s*\w+\s*\.\s*(schreibe|ersetze|markiere|loesche)/).map((t) => t.pfad));

    expect([...schreibend].sort()).toEqual(['ingest/importieren.ts', 'ingest/neuberechnung.ts']);

    for (const pfad of schreibend) {
      const datei = ingest.find((q) => q.pfad === pfad)!;
      expect(sucheImCode([datei], /inTransaktion\s*\(/).length, `${pfad} schreibt ohne Transaktion`).toBeGreaterThan(0);
    }
  });
});
