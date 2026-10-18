import { describe, expect, it } from 'vitest';
import { zuCent, zuKursE6 } from '../../core/dezimal.ts';
import {
  baueDepotreihe,
  eingabeHash,
  ertraege,
  externeFluesse,
  investitionsFluesse,
  kanonischeEingabe,
  startTagFuerNeuberechnung,
} from '../../core/depotreihe.ts';
import type { Hochwassermarke } from '../../core/depotreihe.ts';
import { ausgeglicheneUebertraege } from '../../core/uebertraege.ts';
import type { Kurspunkt, Rasterwert } from '../../core/kursraster.ts';
import type { Tag } from '../../core/kalender.ts';
import { spanne } from '../../core/kalender.ts';
import type { Isin } from '../../core/typen.ts';
import {
  EUROPA,
  T,
  WELT,
  auszahlung,
  einzahlung,
  kauf,
  tx,
  uebertragRaus,
  uebertragRein,
  verkauf,
  zins,
} from '../hilfen.ts';

const raster = (
  eintraege: readonly (readonly [Isin, readonly (readonly [string, string])[]])[],
): Map<Isin, Map<Tag, Rasterwert>> =>
  new Map(
    eintraege.map(([isin, tage]) => [
      isin,
      new Map(tage.map(([tag, kurs]) => [T(tag), { kurs: zuKursE6(kurs), gefuellt: false }])),
    ]),
  );

// Kein Fallback-Rueckhalt: Tests, die die Fuellgrenze selbst nicht beruehren, sollen
// sich verhalten wie ohne die letzterKursBis-Rueckfallkette.
const OHNE_PUNKTE: Map<Isin, readonly Kurspunkt[]> = new Map();

describe('externeFluesse', () => {
  it('nimmt Ueberweisungen und laesst Kaeufe und Zinsen liegen', () => {
    const txe = [
      einzahlung('2026-01-02', '1000'),
      kauf('2026-01-05', WELT, '1', '400'),
      zins('2026-01-31', '3'),
      auszahlung('2026-02-01', '200'),
    ];
    const f = externeFluesse(txe, ausgeglicheneUebertraege(txe));
    expect(f).toEqual([
      { tag: '2026-01-02', betrag: zuCent('1000') },
      { tag: '2026-02-01', betrag: -zuCent('200') },
    ]);
  });

  it('uebergeht Stornos und Schwebendes', () => {
    const storniert = [einzahlung('2026-01-02', '1000', { storniert: true })];
    expect(externeFluesse(storniert, ausgeglicheneUebertraege(storniert))).toEqual([]);
    const schwebend = [einzahlung('2026-01-02', '1000', { status: 'PENDING' })];
    expect(externeFluesse(schwebend, ausgeglicheneUebertraege(schwebend))).toEqual([]);
  });

  it('sortiert nach Tag', () => {
    const txe = [einzahlung('2026-03-02', '1'), einzahlung('2026-01-02', '1')];
    const f = externeFluesse(txe, ausgeglicheneUebertraege(txe));
    expect(f.map((x) => x.tag)).toEqual(['2026-01-02', '2026-03-02']);
  });

  it('liefert fuer ein ausgeglichenes Uebertragspaar keinen Fluss', () => {
    // Regressionstest fuer den beobachteten Sprung im eingezahlten Kapital: ein
    // depotinterner Wechsel ist kein Kapitalfluss, egal wie hoch der Uebertragswert ist.
    const txe = [
      einzahlung('2026-01-02', '1000'),
      uebertragRaus('2026-03-05', WELT, '1', '149510.66'),
      uebertragRein('2026-03-06', WELT, '1', '150276.18'),
    ];
    const f = externeFluesse(txe, ausgeglicheneUebertraege(txe));
    expect(f).toEqual([{ tag: '2026-01-02', betrag: zuCent('1000') }]);
  });

  it('behandelt einen unpaarigen Uebertrag weiterhin als externen Fluss', () => {
    const txe = [uebertragRaus('2026-03-05', WELT, '1', '150')];
    const f = externeFluesse(txe, ausgeglicheneUebertraege(txe));
    expect(f).toEqual([{ tag: '2026-03-05', betrag: -zuCent('150') }]);
  });
});

describe('ertraege', () => {
  it('nimmt Zinsen und Bonus, nicht Ueberweisungen', () => {
    const e = ertraege([zins('2026-01-31', '3'), einzahlung('2026-01-02', '1000')]);
    expect(e).toEqual([{ tag: '2026-01-31', betrag: zuCent('3') }]);
  });

  it('uebergeht Stornos und Schwebendes', () => {
    expect(ertraege([zins('2026-01-31', '3', { storniert: true })])).toEqual([]);
    expect(ertraege([zins('2026-01-31', '3', { status: 'PENDING' })])).toEqual([]);
  });
});

describe('investitionsFluesse', () => {
  it('zaehlt einen Kauf positiv und einen Verkauf negativ', () => {
    const f = investitionsFluesse([
      kauf('2026-01-05', WELT, '1', '400'),
      verkauf('2026-02-05', WELT, '1', '420'),
    ]);
    expect(f).toEqual([
      { tag: '2026-01-05', betrag: zuCent('400') },
      { tag: '2026-02-05', betrag: -zuCent('420') },
    ]);
  });

  it('laesst externe Ueberweisungen und Zinsen liegen', () => {
    const f = investitionsFluesse([einzahlung('2026-01-02', '1000'), zins('2026-01-31', '3')]);
    expect(f).toEqual([]);
  });

  it('laesst einen Depotuebertrag liegen — kein Kauf, kein Verkauf', () => {
    const f = investitionsFluesse([
      uebertragRaus('2026-03-05', WELT, '1', '150'),
      uebertragRein('2026-03-06', EUROPA, '1', '150'),
    ]);
    expect(f).toEqual([]);
  });

  it('laesst Gebuehr und Vorabpauschale liegen, auch mit Wertpapierbezug', () => {
    const f = investitionsFluesse([
      tx({ tag: '2026-01-31', typ: 'FEE', art: 'WERTPAPIER', isin: WELT, betragCent: -zuCent('1') }),
      tx({ tag: '2026-01-31', typ: 'TAX', art: 'WERTPAPIER', isin: WELT, betragCent: -zuCent('2') }),
    ]);
    expect(f).toEqual([]);
  });

  it('uebergeht Stornos und Schwebendes', () => {
    expect(investitionsFluesse([kauf('2026-01-05', WELT, '1', '400', { storniert: true })])).toEqual([]);
    expect(investitionsFluesse([kauf('2026-01-05', WELT, '1', '400', { status: 'PENDING' })])).toEqual([]);
  });

  it('sortiert nach Tag', () => {
    const f = investitionsFluesse([
      kauf('2026-03-02', WELT, '1', '1'),
      kauf('2026-01-02', WELT, '1', '1'),
    ]);
    expect(f.map((x) => x.tag)).toEqual(['2026-01-02', '2026-03-02']);
  });
});

describe('kanonischeEingabe', () => {
  it('sortiert nach ISIN, damit dieselben Daten dieselbe Zeichenkette ergeben', () => {
    const a = kanonischeEingabe([[WELT, 1n], [EUROPA, 2n]], [[WELT, 3n], [EUROPA, 4n]], 5n);
    const b = kanonischeEingabe([[EUROPA, 2n], [WELT, 1n]], [[EUROPA, 4n], [WELT, 3n]], 5n);
    expect(a).toBe(b);
  });

  it('schreibt bigint als Dezimalzeichenkette, nie als Zahl', () => {
    const text = kanonischeEingabe([[WELT, 100000000n]], [[WELT, 98765432n]], -98765n);
    expect(text).toContain('"100000000"');
    expect(text).not.toMatch(/\d+n/);
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('unterscheidet, was unterschieden werden muss', () => {
    expect(kanonischeEingabe([[WELT, 1n]], [], 0n)).not.toBe(kanonischeEingabe([], [[WELT, 1n]], 0n));
    expect(kanonischeEingabe([], [], 1n)).not.toBe(kanonischeEingabe([], [], 10n));
  });

  it('bleibt bei gleicher ISIN in der Eingabereihenfolge, statt sie zu vertauschen', () => {
    // Zwei Eintraege mit derselben ISIN sind fuer den Sortierschritt gleich (0);
    // ein stabiler Sort behaelt dann die urspruengliche Reihenfolge bei.
    const text = kanonischeEingabe([[WELT, 1n], [WELT, 2n]], [[WELT, 3n], [WELT, 4n]], 0n);
    expect(JSON.parse(text)).toEqual({
      mengen: [[WELT, '1'], [WELT, '2']],
      kurse: [[WELT, '3'], [WELT, '4']],
      cash: '0',
    });
  });
});

describe('eingabeHash', () => {
  it('ist stabil und 64 Zeichen lang', () => {
    const h = eingabeHash([[WELT, 1n]], [[WELT, 2n]], 3n);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(eingabeHash([[WELT, 1n]], [[WELT, 2n]], 3n)).toBe(h);
  });

  it('aendert sich, sobald sich eine Eingabe aendert', () => {
    const h = eingabeHash([[WELT, 1n]], [[WELT, 2n]], 3n);
    expect(eingabeHash([[WELT, 1n]], [[WELT, 2n]], 4n)).not.toBe(h);
    expect(eingabeHash([[WELT, 2n]], [[WELT, 2n]], 3n)).not.toBe(h);
  });
});

describe('baueDepotreihe', () => {
  const transaktionen = [einzahlung('2026-01-01', '1000'), kauf('2026-01-02', WELT, '5', '500')];
  const kurse = raster([[WELT, [['2026-01-02', '100'], ['2026-01-03', '110'], ['2026-01-04', '110']]]]);

  it('rechnet Wertpapiere, Cash und Gesamt je Tag', () => {
    const reihe = baueDepotreihe({
      transaktionen,
      raster: kurse,
      punkteJeIsin: OHNE_PUNKTE,
      von: T('2026-01-01'),
      bis: T('2026-01-04'),
    });
    expect(reihe).toHaveLength(4);

    expect(reihe[0]).toMatchObject({
      tag: '2026-01-01',
      wertpapiereCent: 0n,
      cashCent: zuCent('1000'),
      gesamtCent: zuCent('1000'),
      nettoEinzahlungKumCent: zuCent('1000'),
      lueckenhaft: false,
    });

    expect(reihe[1]).toMatchObject({
      tag: '2026-01-02',
      wertpapiereCent: zuCent('500'),
      cashCent: zuCent('500'),
      gesamtCent: zuCent('1000'),
    });

    // Der Kurs steigt: der Depotwert steigt, ohne dass etwas eingezahlt wurde.
    expect(reihe[2]).toMatchObject({
      tag: '2026-01-03',
      wertpapiereCent: zuCent('550'),
      gesamtCent: zuCent('1050'),
      nettoEinzahlungKumCent: zuCent('1000'),
    });
  });

  it('liefert jeden Kalendertag, auch Wochenenden und den Zeitumstellungstag', () => {
    // Die TWR haengt Fluesse an Tage der Reihe; ein fehlender Tag verloere seinen Fluss.
    const reihe = baueDepotreihe({
      transaktionen: [...transaktionen, einzahlung('2026-03-29', '50')],
      raster: kurse,
      punkteJeIsin: OHNE_PUNKTE,
      von: T('2026-01-01'),
      bis: T('2026-04-02'),
    });
    expect(reihe.map((z) => z.tag)).toEqual(spanne(T('2026-01-01'), T('2026-04-02')));
  });

  it('nennt den Positionswert je ISIN', () => {
    const reihe = baueDepotreihe({
      transaktionen,
      raster: kurse,
      punkteJeIsin: OHNE_PUNKTE,
      von: T('2026-01-03'),
      bis: T('2026-01-03'),
    });
    expect(reihe[0]!.positionen.get(WELT)).toBe(zuCent('550'));
  });

  it('markiert einen Tag als lueckenhaft, statt die Position stillschweigend wegzulassen', () => {
    const luecke = raster([[WELT, [['2026-01-02', '100']]]]);
    const reihe = baueDepotreihe({
      transaktionen,
      raster: luecke,
      punkteJeIsin: OHNE_PUNKTE,
      von: T('2026-01-02'),
      bis: T('2026-01-03'),
    });
    expect(reihe[0]!.lueckenhaft).toBe(false);
    expect(reihe[1]!.lueckenhaft).toBe(true);
    // Kein Kurs, auch nicht in der Vergangenheit: die Position fehlt, der Tag ist markiert.
    expect(reihe[1]!.wertpapiereCent).toBe(0n);
  });

  it('greift bei fehlendem Rasterkurs auf den letzten gemessenen zurueck, bleibt aber lueckenhaft', () => {
    const luecke = raster([[WELT, [['2026-01-02', '100']]]]);
    const punkte: Kurspunkt[] = [{ isin: WELT, tag: T('2026-01-02'), kurs: zuKursE6('100'), herkunft: 'chart_max' }];
    const reihe = baueDepotreihe({
      transaktionen,
      raster: luecke,
      punkteJeIsin: new Map([[WELT, punkte]]),
      von: T('2026-01-02'),
      bis: T('2026-01-03'),
    });
    expect(reihe[1]!.lueckenhaft).toBe(true);
    // 5 Stueck zum letzten bekannten Kurs von 100, statt die Position auf null zu setzen.
    expect(reihe[1]!.wertpapiereCent).toBe(zuCent('500'));
  });

  it('laesst einen stornierten Umsatz aus der Cash-Bewegung des Tages heraus', () => {
    const mitStorno = [...transaktionen, einzahlung('2026-01-02', '50', { storniert: true })];
    const reihe = baueDepotreihe({
      transaktionen: mitStorno,
      raster: kurse,
      punkteJeIsin: OHNE_PUNKTE,
      von: T('2026-01-02'),
      bis: T('2026-01-02'),
    });
    const ohneStorno = baueDepotreihe({
      transaktionen,
      raster: kurse,
      punkteJeIsin: OHNE_PUNKTE,
      von: T('2026-01-02'),
      bis: T('2026-01-02'),
    });
    // Der stornierte Umsatz darf weder den Cent-Stand noch den Eingabe-Hash veraendern.
    expect(reihe[0]!.eingabeHash).toBe(ohneStorno[0]!.eingabeHash);
  });

  it('haelt einen Tag ohne Bestand fuer vollstaendig', () => {
    const reihe = baueDepotreihe({
      transaktionen: [einzahlung('2026-01-01', '1000')],
      raster: new Map(),
      punkteJeIsin: OHNE_PUNKTE,
      von: T('2026-01-01'),
      bis: T('2026-01-02'),
    });
    expect(reihe.every((z) => !z.lueckenhaft)).toBe(true);
  });

  it('gibt jedem Tag einen Hash, der nur von seinen Eingaben abhaengt', () => {
    const reihe = baueDepotreihe({
      transaktionen,
      raster: kurse,
      punkteJeIsin: OHNE_PUNKTE,
      von: T('2026-01-03'),
      bis: T('2026-01-04'),
    });
    // Am 03. und 04. sind Menge, Kurs und Cash-Bewegung identisch.
    expect(reihe[0]!.eingabeHash).toBe(reihe[1]!.eingabeHash);
    expect(reihe[0]!.eingabeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('aendert den Hash, wenn sich der Kurs aendert', () => {
    const a = baueDepotreihe({
      transaktionen,
      raster: kurse,
      punkteJeIsin: OHNE_PUNKTE,
      von: T('2026-01-02'),
      bis: T('2026-01-02'),
    });
    const anders = raster([[WELT, [['2026-01-02', '101']]]]);
    const b = baueDepotreihe({
      transaktionen,
      raster: anders,
      punkteJeIsin: OHNE_PUNKTE,
      von: T('2026-01-02'),
      bis: T('2026-01-02'),
    });
    expect(a[0]!.eingabeHash).not.toBe(b[0]!.eingabeHash);
  });

  it('ist wiederholbar: gleiche Eingaben, gleiche Reihe', () => {
    const eingaben = { transaktionen, raster: kurse, punkteJeIsin: OHNE_PUNKTE, von: T('2026-01-01'), bis: T('2026-01-04') };
    expect(baueDepotreihe(eingaben)).toEqual(baueDepotreihe(eingaben));
  });

  it('ergibt fuer eine leere Spanne nichts', () => {
    expect(
      baueDepotreihe({
        transaktionen,
        raster: kurse,
        punkteJeIsin: OHNE_PUNKTE,
        von: T('2026-01-05'),
        bis: T('2026-01-04'),
      }),
    ).toEqual([]);
  });

  it('zeigt an einem ausgeglichenen Uebertragspaar keinen Ausschlag', () => {
    // Regressionstest fuer den beobachteten Absturz-und-Erholung-Sprung im Chart:
    // Bestand, Cash und eingezahltes Kapital bleiben ueber den Migrationstag hinweg glatt.
    const mitUebertrag = [
      einzahlung('2026-01-01', '1000'),
      kauf('2026-01-02', WELT, '5', '500'),
      uebertragRaus('2026-01-03', WELT, '5', '600'),
      uebertragRein('2026-01-04', WELT, '5', '610'),
    ];
    const kurseUebertrag = raster([
      [WELT, [['2026-01-02', '100'], ['2026-01-03', '100'], ['2026-01-04', '100']]],
    ]);
    const reihe = baueDepotreihe({
      transaktionen: mitUebertrag,
      raster: kurseUebertrag,
      punkteJeIsin: OHNE_PUNKTE,
      von: T('2026-01-02'),
      bis: T('2026-01-04'),
    });
    for (const zeile of reihe) {
      expect(zeile.wertpapiereCent).toBe(zuCent('500'));
      expect(zeile.cashCent).toBe(zuCent('500'));
      expect(zeile.gesamtCent).toBe(zuCent('1000'));
      expect(zeile.nettoEinzahlungKumCent).toBe(zuCent('1000'));
    }
  });

  it('bucht einen Uebertrag hinaus ohne Wert als Entnahme zum Tageswert [ADR-043]', () => {
    const txe = [einzahlung('2026-01-01', '1000'), kauf('2026-01-02', WELT, '5', '500'), uebertragRaus('2026-01-03', WELT, '5', '0')];
    const punkte: Map<Isin, readonly Kurspunkt[]> = new Map([
      [WELT, [{ isin: WELT, tag: T('2026-01-03'), kurs: zuKursE6('110'), herkunft: 'chart_max' }]],
    ]);
    const reihe = baueDepotreihe({
      transaktionen: txe,
      raster: raster([[WELT, [['2026-01-02', '100'], ['2026-01-03', '110']]]]),
      punkteJeIsin: punkte,
      von: T('2026-01-02'),
      bis: T('2026-01-03'),
    });
    expect(reihe[1]!.nettoEinzahlungKumCent).toBe(zuCent('450'));
    expect(reihe[1]!.gesamtCent).toBe(zuCent('500'));
  });

  it('uebergeht eine Position, die auf null gefallen ist', () => {
    const mitVerkauf = [
      ...transaktionen,
      tx({ tag: '2026-01-03', art: 'WERTPAPIER', typ: 'SELL', isin: WELT, mengeE8: -500000000n, betragCent: zuCent('550') }),
    ];
    const reihe = baueDepotreihe({
      transaktionen: mitVerkauf,
      raster: kurse,
      punkteJeIsin: OHNE_PUNKTE,
      von: T('2026-01-03'),
      bis: T('2026-01-03'),
    });
    expect(reihe[0]!.wertpapiereCent).toBe(0n);
    expect(reihe[0]!.positionen.size).toBe(0);
    expect(reihe[0]!.lueckenhaft).toBe(false);
  });
});

describe('startTagFuerNeuberechnung', () => {
  const basis: Hochwassermarke = {
    letzterBerechneterTag: T('2026-08-20'),
    aeltesteGeaenderteTransaktion: null,
    aeltesterGeaenderterKurs: null,
    gespeicherteKernVersion: 1,
    aktuelleKernVersion: 1,
    ersterTag: T('2021-06-14'),
  };

  it('rechnet nur den Tag nach dem letzten weiter', () => {
    expect(startTagFuerNeuberechnung(basis)).toBe('2026-08-21');
  });

  it('geht bis zur aeltesten geaenderten Transaktion zurueck', () => {
    expect(startTagFuerNeuberechnung({ ...basis, aeltesteGeaenderteTransaktion: T('2026-03-01') })).toBe('2026-03-01');
  });

  it('geht bis zum aeltesten geaenderten Kurs zurueck', () => {
    expect(startTagFuerNeuberechnung({ ...basis, aeltesterGeaenderterKurs: T('2026-02-01') })).toBe('2026-02-01');
  });

  it('nimmt das Minimum aus allem, was sich geaendert hat', () => {
    expect(
      startTagFuerNeuberechnung({
        ...basis,
        aeltesteGeaenderteTransaktion: T('2026-03-01'),
        aeltesterGeaenderterKurs: T('2026-02-01'),
      }),
    ).toBe('2026-02-01');
  });

  it('rechnet die gesamte Historie neu, wenn KERN_VERSION gesprungen ist', () => {
    expect(startTagFuerNeuberechnung({ ...basis, aktuelleKernVersion: 2 })).toBe('2021-06-14');
    expect(startTagFuerNeuberechnung({ ...basis, gespeicherteKernVersion: null })).toBe('2021-06-14');
  });

  it('faengt beim ersten Tag an, wenn noch nichts berechnet wurde', () => {
    expect(startTagFuerNeuberechnung({ ...basis, letzterBerechneterTag: null })).toBe('2021-06-14');
  });

  it('geht nie vor den Anfang der Historie zurueck', () => {
    expect(startTagFuerNeuberechnung({ ...basis, aeltesterGeaenderterKurs: T('2019-01-01') })).toBe('2021-06-14');
  });
});
