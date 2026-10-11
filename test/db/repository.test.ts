import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zuCent, zuKursE6, zuMengeE8 } from '../../core/dezimal.ts';
import {
  bestand as bestandRepo,
  depotTag as depotTagRepo,
  etfBestandteil,
  inTransaktion,
  kurs as kursRepo,
  lauf as laufRepo,
  rawSnapshot,
  sparplan as sparplanRepo,
  transaktion as txRepo,
  vpi as vpiRepo,
  wertpapierArt,
  zins as zinsRepo,
} from '../../db/repository/index.ts';
import type { NeueTx } from '../../db/repository/transaktion.ts';
import { testDatenbank } from '../../db/verbindung.ts';
import { EUROPA, T, WELT, bestand, einzahlung, kauf, verkauf } from '../hilfen.ts';

let db: DatabaseSync;

beforeEach(async () => {
  db = await testDatenbank();
});

afterEach(() => {
  db.close();
});

const gesehen = (tx: ReturnType<typeof kauf>, am = '2026-08-26T18:00:00+02:00'): NeueTx => ({ ...tx, gesehenAm: am });

describe('transaktion', () => {
  it('schreibt und liest ohne Verlust — Betraege bleiben bigint', () => {
    const t = gesehen(kauf('2026-01-05', WELT, '1.5', '378.05'));
    txRepo.schreibe(db, t);

    const gelesen = txRepo.alle(db);
    expect(gelesen).toHaveLength(1);
    expect(gelesen[0]!.betragCent).toBe(-zuCent('378.05'));
    expect(typeof gelesen[0]!.betragCent).toBe('bigint');
    expect(gelesen[0]!.mengeE8).toBe(zuMengeE8('1.5'));
    expect(gelesen[0]!.istExtern).toBe(false);
    expect(gelesen[0]!.storniert).toBe(false);
  });

  it('ist idempotent: derselbe Lauf zweimal ergibt eine Zeile', () => {
    const t = gesehen(kauf('2026-01-05', WELT, '1', '100'));
    txRepo.schreibeViele(db, [t, t]);
    txRepo.schreibeViele(db, [t]);
    expect(txRepo.anzahl(db)).toBe(1);
  });

  it('uebernimmt geaenderte Felder derselben ID', () => {
    const t = gesehen(kauf('2026-01-05', WELT, '1', '100'));
    txRepo.schreibe(db, t);
    txRepo.schreibe(db, { ...t, status: 'CANCELED', gesehenAm: '2026-08-27T09:00:00+02:00' });
    expect(txRepo.alle(db)[0]!.status).toBe('CANCELED');
    expect(txRepo.anzahl(db)).toBe(1);
  });

  it('sortiert nach Tag, Zeitstempel und ID', () => {
    txRepo.schreibeViele(db, [
      gesehen(kauf('2026-02-01', WELT, '1', '100')),
      gesehen(kauf('2026-01-01', WELT, '1', '100')),
    ]);
    expect(txRepo.alle(db).map((t) => t.tag)).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('liefert nur Transaktionen ab einem Tag', () => {
    txRepo.schreibeViele(db, [
      gesehen(kauf('2026-01-01', WELT, '1', '100')),
      gesehen(kauf('2026-03-01', WELT, '1', '100')),
    ]);
    expect(txRepo.abTag(db, T('2026-02-01'))).toHaveLength(1);
  });

  it('nennt den ersten Tag ohne Stornos und ohne Schwebendes', () => {
    txRepo.schreibeViele(db, [
      gesehen(kauf('2026-01-01', WELT, '1', '100', { storniert: true })),
      gesehen(kauf('2026-01-15', WELT, '1', '100', { status: 'PENDING' })),
      gesehen(kauf('2026-02-01', WELT, '1', '100')),
    ]);
    expect(txRepo.ersterTag(db)).toBe('2026-02-01');
  });

  it('nennt null, wenn es keine gueltige Transaktion gibt', () => {
    expect(txRepo.ersterTag(db)).toBeNull();
  });

  it('findet die aelteste Aenderung seit einem Zeitpunkt — die Hochwassermarke', () => {
    txRepo.schreibe(db, gesehen(kauf('2026-01-01', WELT, '1', '100'), '2026-08-20T10:00:00+02:00'));
    txRepo.schreibe(db, gesehen(kauf('2026-03-01', WELT, '1', '100'), '2026-08-26T10:00:00+02:00'));
    expect(txRepo.aeltesteAenderungSeit(db, '2026-08-25T00:00:00+02:00')).toBe('2026-03-01');
    expect(txRepo.aeltesteAenderungSeit(db, '2026-08-27T00:00:00+02:00')).toBeNull();
  });

  it('markiert Verschwundenes als storniert, statt es zu loeschen', () => {
    const t = gesehen(kauf('2026-01-05', WELT, '1', '100'));
    txRepo.schreibe(db, t);
    expect(txRepo.markiereStorniert(db, [t.id])).toBe(1);
    // Zweiter Aufruf aendert nichts mehr — schon storniert.
    expect(txRepo.markiereStorniert(db, [t.id])).toBe(0);
    expect(txRepo.anzahl(db)).toBe(1);
    expect(txRepo.alle(db)[0]!.storniert).toBe(true);
  });

  it('zaehlt die vorkommenden Typen', () => {
    txRepo.schreibeViele(db, [
      gesehen(kauf('2026-01-01', WELT, '1', '100')),
      gesehen(kauf('2026-01-02', WELT, '1', '100')),
      gesehen(einzahlung('2026-01-03', '500')),
    ]);
    expect(txRepo.typen(db)).toEqual([
      { typ: 'BUY', anzahl: 2 },
      { typ: 'CASH_TRANSFER_IN', anzahl: 1 },
    ]);
  });

  it('trennt nach ISIN', () => {
    txRepo.schreibeViele(db, [
      gesehen(kauf('2026-01-01', WELT, '1', '100')),
      gesehen(kauf('2026-01-02', EUROPA, '1', '100')),
    ]);
    expect(txRepo.fuerIsin(db, WELT)).toHaveLength(1);
  });
});

describe('kurs', () => {
  const punkt = (tag: string, kurs: string, herkunft: 'transaktion' | 'chart_1m' | 'chart_max') => ({
    isin: WELT,
    tag: T(tag),
    kurs: zuKursE6(kurs),
    herkunft,
  });

  it('laesst die bessere Herkunft die schlechtere ueberschreiben', () => {
    kursRepo.schreibe(db, punkt('2026-01-05', '100', 'chart_max'));
    kursRepo.schreibe(db, punkt('2026-01-05', '101', 'transaktion'));
    expect(kursRepo.fuerIsin(db, WELT)[0]!.kurs).toBe(zuKursE6('101'));
  });

  it('laesst die schlechtere Herkunft die bessere in Ruhe', () => {
    kursRepo.schreibe(db, punkt('2026-01-05', '101', 'transaktion'));
    kursRepo.schreibe(db, punkt('2026-01-05', '100', 'chart_max'));
    const k = kursRepo.fuerIsin(db, WELT)[0]!;
    expect(k.kurs).toBe(zuKursE6('101'));
    expect(k.herkunft).toBe('transaktion');
  });

  it('laesst gleichrangige Herkunft ueberschreiben — der neuere Abruf gewinnt', () => {
    kursRepo.schreibe(db, punkt('2026-01-05', '100', 'chart_1m'));
    kursRepo.schreibe(db, punkt('2026-01-05', '102', 'chart_1m'));
    expect(kursRepo.fuerIsin(db, WELT)[0]!.kurs).toBe(zuKursE6('102'));
  });

  it('haelt einen Tag je ISIN', () => {
    kursRepo.schreibeViele(db, [punkt('2026-01-05', '100', 'chart_1m'), punkt('2026-01-05', '100', 'chart_1m')]);
    expect(kursRepo.anzahl(db)).toBe(1);
  });

  it('merkt sich auffaellige Tage', () => {
    kursRepo.schreibe(db, punkt('2026-01-05', '100', 'chart_1m'));
    expect(kursRepo.istAuffaellig(db, WELT, T('2026-01-05'))).toBe(false);
    kursRepo.markiereAuffaellig(db, WELT, T('2026-01-05'), true);
    expect(kursRepo.istAuffaellig(db, WELT, T('2026-01-05'))).toBe(true);
    expect(kursRepo.auffaellige(db)).toEqual([{ isin: WELT, tag: '2026-01-05' }]);
  });

  it('nennt den letzten Tag und alle ISINs', () => {
    kursRepo.schreibeViele(db, [punkt('2026-01-05', '100', 'chart_1m'), punkt('2026-02-05', '100', 'chart_1m')]);
    kursRepo.schreibe(db, { isin: EUROPA, tag: T('2026-01-01'), kurs: zuKursE6('50'), herkunft: 'chart_1m' });
    expect(kursRepo.letzterTag(db, WELT)).toBe('2026-02-05');
    expect(kursRepo.letzterTag(db, 'DE0000000000')).toBeNull();
    expect(kursRepo.isins(db)).toEqual([EUROPA, WELT].sort());
  });
});

describe('bestand', () => {
  it('ersetzt vollstaendig: was die Bank nicht mehr meldet, ist weg', () => {
    bestandRepo.ersetze(db, [bestand(WELT, '10', '100', 'Welt'), bestand(EUROPA, '5', '50', 'Europa')]);
    bestandRepo.ersetze(db, [bestand(WELT, '12', '101', 'Welt')]);

    const alle = bestandRepo.alle(db);
    expect(alle).toHaveLength(1);
    expect(alle[0]!.mengeE8).toBe(zuMengeE8('12'));
    expect(bestandRepo.fuerIsin(db, EUROPA)).toBeNull();
  });

  it('liefert Namen und Stand fuer die Anzeige', () => {
    bestandRepo.ersetze(db, [bestand(WELT, '10', '100', 'Welt-ETF')]);
    expect(bestandRepo.namen(db).get(WELT)).toBe('Welt-ETF');
    expect(bestandRepo.stand(db)).toBe('2026-08-26T18:00:00+02:00');
  });

  it('nimmt einen Namen mit Markup als Text auf', () => {
    const boesartig = '<img src=x onerror=alert(1)>';
    bestandRepo.ersetze(db, [bestand(WELT, '1', '1', boesartig)]);
    expect(bestandRepo.alle(db)[0]!.name).toBe(boesartig);
  });
});

describe('wertpapier_art', () => {
  it('legt die Art je ISIN ab und ueberschreibt bei erneutem Setzen', () => {
    wertpapierArt.setze(db, { isin: WELT, art: 'ETF', geprueftAm: '2026-08-26' });
    wertpapierArt.setze(db, { isin: EUROPA, art: 'STOCK', geprueftAm: '2026-08-26' });
    wertpapierArt.setze(db, { isin: EUROPA, art: 'ETF', geprueftAm: '2026-08-27' });

    expect(wertpapierArt.alle(db)).toEqual(
      new Map([
        [WELT, 'ETF'],
        [EUROPA, 'ETF'],
      ]),
    );
  });

  it('ueberlebt das vollstaendige Ersetzen des Bestands', () => {
    wertpapierArt.setze(db, { isin: WELT, art: 'ETF', geprueftAm: '2026-08-26' });
    bestandRepo.ersetze(db, [bestand(WELT, '1', '1', 'Welt')]);
    bestandRepo.ersetze(db, []);
    expect(wertpapierArt.alle(db).get(WELT)).toBe('ETF');
  });
});

describe('depot_tag', () => {
  const zeile = (tag: string, gesamt: string, version = 1, hash = 'a'.repeat(64)) => ({
    tag: T(tag),
    wertpapiereCent: zuCent(gesamt),
    cashCent: 0n,
    gesamtCent: zuCent(gesamt),
    nettoEinzahlungKumCent: zuCent('1000'),
    lueckenhaft: false,
    kernVersion: version,
    eingabeHash: hash,
    berechnetAm: '2026-08-26T18:00:00+02:00',
    positionen: new Map(),
  });

  it('schreibt, liest und ueberschreibt denselben Tag', () => {
    depotTagRepo.schreibe(db, zeile('2026-01-01', '1000'));
    depotTagRepo.schreibe(db, zeile('2026-01-01', '1100'));
    expect(depotTagRepo.anzahl(db)).toBe(1);
    expect(depotTagRepo.fuerTag(db, T('2026-01-01'))!.gesamtCent).toBe(zuCent('1100'));
  });

  it('liefert Spanne, ersten und letzten Tag', () => {
    depotTagRepo.schreibeViele(db, [zeile('2026-01-01', '1000'), zeile('2026-01-02', '1010'), zeile('2026-01-03', '1020')]);
    expect(depotTagRepo.spanne(db, T('2026-01-02'), T('2026-01-03')).map((z) => z.tag)).toEqual([
      '2026-01-02',
      '2026-01-03',
    ]);
    expect(depotTagRepo.ersterTag(db)).toBe('2026-01-01');
    expect(depotTagRepo.letzter(db)!.tag).toBe('2026-01-03');
  });

  it('nennt den letzten Tag der aktuellen Kernversion — alles Aeltere muss neu', () => {
    depotTagRepo.schreibeViele(db, [zeile('2026-01-01', '1000', 1), zeile('2026-01-02', '1010', 2)]);
    expect(depotTagRepo.letzterMitVersion(db, 2)).toBe('2026-01-02');
    expect(depotTagRepo.letzterMitVersion(db, 3)).toBeNull();
    // Die kleinste gespeicherte Version entscheidet: eine einzige alte Zeile
    // macht die ganze Reihe alt.
    expect(depotTagRepo.gespeicherteKernVersion(db)).toBe(1);
  });

  it('meldet null als gespeicherte Kernversion, solange nichts gerechnet wurde', () => {
    expect(depotTagRepo.gespeicherteKernVersion(db)).toBeNull();
  });

  it('verwirft ab einem Tag', () => {
    depotTagRepo.schreibeViele(db, [zeile('2026-01-01', '1000'), zeile('2026-01-02', '1010'), zeile('2026-01-03', '1020')]);
    expect(depotTagRepo.loescheAb(db, T('2026-01-02'))).toBe(2);
    expect(depotTagRepo.alle(db).map((z) => z.tag)).toEqual(['2026-01-01']);
    expect(depotTagRepo.loescheAlles(db)).toBe(1);
  });

  it('zaehlt lueckenhafte Tage', () => {
    depotTagRepo.schreibe(db, { ...zeile('2026-01-01', '1000'), lueckenhaft: true });
    depotTagRepo.schreibe(db, zeile('2026-01-02', '1000'));
    expect(depotTagRepo.lueckenhafteTage(db)).toBe(1);
  });

  it('zaehlt lueckenhafte Tage ab einem Stichtag, den Stichtag eingeschlossen', () => {
    depotTagRepo.schreibe(db, { ...zeile('2026-01-01', '1000'), lueckenhaft: true });
    depotTagRepo.schreibe(db, { ...zeile('2026-01-02', '1000'), lueckenhaft: true });
    depotTagRepo.schreibe(db, { ...zeile('2026-01-03', '1000'), lueckenhaft: true });
    expect(depotTagRepo.lueckenhafteTageAb(db, T('2026-01-02'))).toBe(2);
    expect(depotTagRepo.lueckenhafteTageAb(db, T('2026-01-04'))).toBe(0);
  });
});

describe('etf_bestandteil', () => {
  const teil = (unternehmen: string, gewicht: number) => ({
    fondsIsin: WELT,
    unternehmenIsin: unternehmen,
    name: unternehmen,
    gewicht,
    sektor: 'Technologie',
    land: 'US',
  });

  it('haelt mehrere Staende nebeneinander und liefert den neuesten', () => {
    etfBestandteil.ersetzeFuerStand(db, WELT, '2026-07-31', [teil('US1', 0.5)]);
    etfBestandteil.ersetzeFuerStand(db, WELT, '2026-08-31', [teil('US1', 0.4), teil('US2', 0.3)]);

    expect(etfBestandteil.neuesterStand(db, WELT)).toBe('2026-08-31');
    expect(etfBestandteil.aktuelle(db).map((b) => b.unternehmenIsin)).toEqual(['US1', 'US2']);
    expect(etfBestandteil.fuerFonds(db, WELT, '2026-07-31')).toHaveLength(1);
  });

  it('ersetzt einen Stand vollstaendig, statt ihn zu ergaenzen', () => {
    etfBestandteil.ersetzeFuerStand(db, WELT, '2026-08-31', [teil('US1', 0.5), teil('US2', 0.5)]);
    etfBestandteil.ersetzeFuerStand(db, WELT, '2026-08-31', [teil('US1', 1)]);
    expect(etfBestandteil.fuerFonds(db, WELT, '2026-08-31')).toHaveLength(1);
  });

  it('raeumt alte Staende bis auf die letzten zwei ab', () => {
    for (const stand of ['2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31']) {
      etfBestandteil.ersetzeFuerStand(db, WELT, stand, [teil('US1', 1)]);
    }
    expect(etfBestandteil.alteStaendeEntfernen(db, WELT)).toBe(2);
    expect(etfBestandteil.anzahl(db)).toBe(2);
  });

  it('trennt die Fonds', () => {
    etfBestandteil.ersetzeFuerStand(db, WELT, '2026-08-31', [teil('US1', 1)]);
    etfBestandteil.ersetzeFuerStand(db, EUROPA, '2026-08-31', [{ ...teil('US1', 1), fondsIsin: EUROPA }]);
    expect(etfBestandteil.fonds(db)).toEqual([EUROPA, WELT].sort());
  });
});

describe('vpi', () => {
  it('schreibt, ueberschreibt und liefert die Karte fuer den Rechenkern', () => {
    vpiRepo.schreibeViele(db, [
      { monat: '2026-01', indexWert: 100.1, quelle: 'eurostat' },
      { monat: '2026-02', indexWert: 100.4, quelle: 'eurostat' },
    ]);
    vpiRepo.schreibeViele(db, [{ monat: '2026-02', indexWert: 100.5, quelle: 'eurostat' }]);

    expect(vpiRepo.anzahl(db)).toBe(2);
    expect(vpiRepo.alsKarte(db).get('2026-02')).toBe(100.5);
    expect(vpiRepo.letzterMonat(db)).toBe('2026-02');
  });

  it('gibt eine leere Karte zurueck, solange nichts da ist', () => {
    expect(vpiRepo.alsKarte(db).size).toBe(0);
    expect(vpiRepo.letzterMonat(db)).toBeNull();
  });
});

describe('zins', () => {
  it('schreibt, ueberschreibt und liefert die Karte fuer den Rechenkern', () => {
    zinsRepo.schreibeViele(db, [
      { tag: '2026-08-20', zinsProJahr: -0.0055, quelle: 'ezb:EST' },
      { tag: '2026-08-21', zinsProJahr: -0.0056, quelle: 'ezb:EST' },
    ]);
    zinsRepo.schreibeViele(db, [{ tag: '2026-08-21', zinsProJahr: -0.0057, quelle: 'ezb:EST' }]);

    expect(zinsRepo.anzahl(db)).toBe(2);
    expect(zinsRepo.alsKarte(db).get(T('2026-08-21'))).toBeCloseTo(-0.0057);
    expect(zinsRepo.letzterTag(db)).toBe('2026-08-21');
  });

  it('gibt eine leere Karte zurueck, solange nichts da ist', () => {
    expect(zinsRepo.alsKarte(db).size).toBe(0);
    expect(zinsRepo.letzterTag(db)).toBeNull();
  });
});

describe('sparplan', () => {
  const plan = (isin: string, betrag: string, frequenz: string) => ({
    isin,
    name: `Plan ${isin}`,
    betragCent: zuCent(betrag),
    frequenz,
    tagImMonat: 1,
    naechsteAusfuehrung: '2026-09-01',
    stand: '2026-08-26T18:00:00+02:00',
  });

  it('ersetzt vollstaendig und liest zurueck', () => {
    sparplanRepo.ersetze(db, [plan(WELT, '300', 'MONTHLY'), plan(EUROPA, '100', 'MONTHLY')]);
    sparplanRepo.ersetze(db, [plan(WELT, '350', 'MONTHLY')]);
    expect(sparplanRepo.alle(db)).toHaveLength(1);
    expect(sparplanRepo.alle(db)[0]!.betragCent).toBe(zuCent('350'));
  });

  it('rechnet Frequenzen auf den Monat um', () => {
    sparplanRepo.ersetze(db, [plan(WELT, '300', 'MONTHLY'), plan(EUROPA, '30', 'QUARTERLY')]);
    expect(sparplanRepo.monatsSumme(db)).toBe(zuCent('300') + zuCent('30') / 3n);
  });

  it('uebergeht eine unbekannte Frequenz, statt sie zu raten', () => {
    sparplanRepo.ersetze(db, [plan(WELT, '300', 'IRGENDWANN')]);
    expect(sparplanRepo.monatsSumme(db)).toBe(0n);
  });
});

describe('raw_snapshot', () => {
  it('archiviert je Quelle und liefert den neuesten', () => {
    rawSnapshot.schreibe(db, 'holdings', '2026-08-25T18:00:00+02:00', '{"a":1}');
    rawSnapshot.schreibe(db, 'holdings', '2026-08-26T18:00:00+02:00', '{"a":2}');
    rawSnapshot.schreibe(db, 'transaktionen', '2026-08-26T18:00:00+02:00', '{"b":1}');

    expect(rawSnapshot.letzter(db, 'holdings')!.payloadJson).toBe('{"a":2}');
    expect(rawSnapshot.quellen(db)).toEqual(['holdings', 'transaktionen']);
    expect(rawSnapshot.neuesteJeQuelle(db).map((s) => s.quelle)).toEqual(['holdings', 'transaktionen']);
    expect(rawSnapshot.alleFuer(db, 'holdings')).toHaveLength(2);
  });

  it('meldet null fuer eine unbekannte Quelle', () => {
    expect(rawSnapshot.letzter(db, 'gibtsnicht')).toBeNull();
  });

  it('kuerzt das Archiv nur auf Zuruf', () => {
    for (let i = 1; i <= 5; i += 1) rawSnapshot.schreibe(db, 'holdings', `2026-08-2${i}T18:00:00+02:00`, '{}');
    expect(rawSnapshot.anzahl(db)).toBe(5);
    expect(rawSnapshot.aeltereEntfernen(db, 'holdings', 2)).toBe(3);
    expect(rawSnapshot.anzahl(db)).toBe(2);
  });
});

describe('lauf', () => {
  it('protokolliert Anfang und Ende', () => {
    const id = laufRepo.starte(db, '2026-08-26T18:00:00+02:00');
    expect(laufRepo.letzter(db)!.status).toBe('laufend');

    laufRepo.beende(db, id, {
      beendet: '2026-08-26T18:00:30+02:00',
      status: 'erfolg',
      quellen: { holdings: 'erfolg', ishares: 'fehler' },
      hinweise: [{ art: 'storniert', werte: { anzahl: 3 } }],
    });

    const l = laufRepo.letzter(db)!;
    expect(l.status).toBe('erfolg');
    expect(l.quellen.ishares).toBe('fehler');
    expect(l.hinweise).toEqual([{ art: 'storniert', werte: { anzahl: 3 } }]);
  });

  it('liest Hinweise aus der Zeit vor den Arten als Text', () => {
    const id = laufRepo.starte(db, '2026-08-26T18:00:00+02:00');
    laufRepo.beende(db, id, { beendet: '2026-08-26T18:00:30+02:00', status: 'erfolg', quellen: {} });
    db.prepare('UPDATE lauf SET hinweise_json = ? WHERE id = ?').run(JSON.stringify(['Alter Satz.', 7]), id);
    expect(laufRepo.letzter(db)!.hinweise).toEqual([{ art: 'text', werte: { text: 'Alter Satz.' } }]);
  });

  it('nennt den letzten Lauf, der etwas gebracht hat', () => {
    const eins = laufRepo.starte(db, '2026-08-25T18:00:00+02:00');
    laufRepo.beende(db, eins, { beendet: '2026-08-25T18:01:00+02:00', status: 'teilweise', quellen: {} });
    const zwei = laufRepo.starte(db, '2026-08-26T18:00:00+02:00');
    laufRepo.beende(db, zwei, { beendet: '2026-08-26T18:01:00+02:00', status: 'fehler', quellen: {} });

    expect(laufRepo.letzter(db)!.id).toBe(zwei);
    expect(laufRepo.letzterErfolgreicher(db)!.id).toBe(eins);
  });

  it('raeumt haengende Laeufe auf, statt ewig `laufend` zu zeigen', () => {
    laufRepo.starte(db, '2026-08-25T18:00:00+02:00');
    expect(laufRepo.raeumeHaengende(db, '2026-08-26T18:00:00+02:00')).toBe(1);
    const l = laufRepo.letzter(db)!;
    expect(l.status).toBe('fehler');
    expect(l.fehlerCode).toBe('E_ABGEBROCHEN');
  });

  it('fuehrt den Schritt und vergisst ihn am Ende', () => {
    const id = laufRepo.starte(db, '2026-08-26T18:00:00+02:00');
    expect(laufRepo.letzter(db)!.schritt).toBeNull();
    laufRepo.setzeSchritt(db, id, 'kurse');
    expect(laufRepo.letzter(db)!.schritt).toBe('kurse');
    laufRepo.beende(db, id, { beendet: '2026-08-26T18:00:30+02:00', status: 'erfolg', quellen: {} });
    expect(laufRepo.letzter(db)!.schritt).toBeNull();

    const haengend = laufRepo.starte(db, '2026-08-27T18:00:00+02:00');
    laufRepo.setzeSchritt(db, haengend, 'fonds');
    laufRepo.raeumeHaengende(db, '2026-08-28T18:00:00+02:00');
    expect(laufRepo.letzter(db)!.schritt).toBeNull();
  });

  it('liest einen unbekannten Schritt als keinen', () => {
    const id = laufRepo.starte(db, '2026-08-26T18:00:00+02:00');
    db.prepare('UPDATE lauf SET schritt = ? WHERE id = ?').run('import', id);
    expect(laufRepo.letzter(db)!.schritt).toBeNull();
  });

  it('uebersteht kaputtes JSON in der eigenen Spalte', () => {
    const id = laufRepo.starte(db, '2026-08-26T18:00:00+02:00');
    db.prepare('UPDATE lauf SET quellen_json = ?, hinweise_json = ? WHERE id = ?').run('kein json', '{[', id);
    const l = laufRepo.letzter(db)!;
    expect(l.quellen).toEqual({});
    expect(l.hinweise).toEqual([]);
  });

  it('begrenzt die Liste', () => {
    for (let i = 0; i < 5; i += 1) laufRepo.starte(db, `2026-08-2${i}T18:00:00+02:00`);
    expect(laufRepo.letzte(db, 3)).toHaveLength(3);
  });
});

describe('inTransaktion', () => {
  it('schreibt alles oder nichts', () => {
    expect(() =>
      inTransaktion(db, () => {
        txRepo.schreibe(db, gesehen(kauf('2026-01-01', WELT, '1', '100')));
        throw new Error('mittendrin');
      }),
    ).toThrow('mittendrin');

    expect(txRepo.anzahl(db)).toBe(0);
  });

  it('gibt das Ergebnis der Arbeit zurueck', () => {
    const anzahl = inTransaktion(db, () =>
      txRepo.schreibeViele(db, [gesehen(kauf('2026-01-01', WELT, '1', '100')), gesehen(verkauf('2026-01-02', WELT, '1', '110'))]),
    );
    expect(anzahl).toBe(2);
    expect(txRepo.anzahl(db)).toBe(2);
  });

  it('laesst einen zweiten Lauf denselben Stand herstellen — idempotent ueber Tabellen hinweg', () => {
    // Dieselbe Antwort der Bank zweimal: dieselbe ID, nicht eine neue.
    const antwort = gesehen(kauf('2026-01-01', WELT, '1', '100'));

    const importieren = (): void => {
      inTransaktion(db, () => {
        txRepo.schreibeViele(db, [antwort]);
        bestandRepo.ersetze(db, [bestand(WELT, '1', '110')]);
        kursRepo.schreibeViele(db, [{ isin: WELT, tag: T('2026-01-01'), kurs: zuKursE6('100'), herkunft: 'transaktion' }]);
      });
    };

    importieren();
    const nachEins = { tx: txRepo.alle(db), bestand: bestandRepo.alle(db), kurse: kursRepo.alle(db) };
    importieren();
    expect({ tx: txRepo.alle(db), bestand: bestandRepo.alle(db), kurse: kursRepo.alle(db) }).toEqual(nachEins);
  });
});
