import { describe, expect, it } from 'vitest';
import { DezimalFehler, alsText, anteil, betragVon, euroText, rundeAufCent, summe, wert, zuCent, zuKursE6, zuMengeE8 } from '../../core/dezimal.ts';

describe('zuCent', () => {
  it('liest Punkt und Komma gleich', () => {
    expect(zuCent('10.67')).toBe(1067n);
    expect(zuCent('10,67')).toBe(1067n);
  });

  it('haelt den Wert, an dem parseFloat scheitert', () => {
    // 10.671 * 100 ergibt in Fliesskomma 1067.0999999999999.
    expect(zuCent('10.671')).toBe(1067n);
    expect(zuCent('0.1')).toBe(10n);
    expect(zuCent('0.07')).toBe(7n);
    expect(zuCent('1.005')).toBe(101n);
  });

  it('rundet half-up vom Betrag weg, in beide Richtungen', () => {
    expect(zuCent('0.005')).toBe(1n);
    expect(zuCent('-0.005')).toBe(-1n);
    expect(zuCent('0.004')).toBe(0n);
    expect(zuCent('-0.004')).toBe(0n);
  });

  it('nimmt Vorzeichen, fehlende Stellen und fehlende Vorkommastelle', () => {
    expect(zuCent('+5')).toBe(500n);
    expect(zuCent('-5')).toBe(-500n);
    expect(zuCent('.5')).toBe(50n);
    expect(zuCent('5.')).toBe(500n);
    expect(zuCent('  7,5  ')).toBe(750n);
  });

  it('nimmt eine number, ohne den Fliesskomma-Schmutz mitzunehmen', () => {
    expect(zuCent(0.1 + 0.2)).toBe(30n);
    expect(zuCent(1234.565)).toBe(123457n);
  });

  it('weist zurueck, was keine Zahl ist', () => {
    for (const kaputt of ['', '   ', 'abc', '1.2.3', '1,2,3', '1e5', '1E5', '--1', '1-2']) {
      expect(() => zuCent(kaputt), kaputt).toThrow(DezimalFehler);
    }
  });

  it('weist Exponentialschreibweise ausdruecklich zurueck', () => {
    expect(() => zuCent('1.5e3')).toThrow(/Exponentialschreibweise/);
  });

  it('weist nicht endliche Zahlen zurueck', () => {
    expect(() => zuCent(Number.NaN)).toThrow(/nicht endlich/);
    expect(() => zuCent(Number.POSITIVE_INFINITY)).toThrow(/nicht endlich/);
  });

  it('nennt die Eingabe im Fehler', () => {
    try {
      zuCent('kaputt');
      expect.unreachable('haette werfen muessen');
    } catch (fehler) {
      expect(fehler).toBeInstanceOf(DezimalFehler);
      expect((fehler as DezimalFehler).eingabe).toBe('kaputt');
      expect((fehler as DezimalFehler).name).toBe('DezimalFehler');
    }
  });

  it('verliert bei sehr grossen Betraegen keine Stelle', () => {
    expect(zuCent('123456789012345.67')).toBe(12345678901234567n);
  });

  it('weist ein blosses Vorzeichen oder Trennzeichen ohne Ziffer zurueck', () => {
    for (const kaputt of ['+', '-', '.', ',']) {
      expect(() => zuCent(kaputt), kaputt).toThrow(/keine Ziffern/);
    }
  });

  it('nimmt eine sehr grosse number noch als Festkommazahl', () => {
    // Ab 1e15 greift der String(v)-Zweig statt toFixed(12) — beides ohne Exponent.
    expect(zuCent(2e15)).toBe(200000000000000000n);
  });

  it('weist eine number zurueck, die nur noch als Exponent darstellbar ist', () => {
    expect(() => zuCent(1e21)).toThrow(/zu gross/);
  });
});

describe('zuMengeE8 und zuKursE6', () => {
  it('skalieren auf acht bzw. sechs Stellen', () => {
    expect(zuMengeE8('1')).toBe(100_000_000n);
    expect(zuMengeE8('0.00000001')).toBe(1n);
    expect(zuMengeE8('0.000000005')).toBe(1n);
    expect(zuKursE6('123.456789')).toBe(123_456_789n);
    expect(zuKursE6('123.4567894')).toBe(123_456_789n);
    expect(zuKursE6('123.4567895')).toBe(123_456_790n);
  });
});

describe('rundeAufCent', () => {
  it('rundet kaufmaennisch, vom Betrag weg', () => {
    expect(rundeAufCent(5n, 2n)).toBe(3n);
    expect(rundeAufCent(-5n, 2n)).toBe(-3n);
    expect(rundeAufCent(5n, -2n)).toBe(-3n);
    expect(rundeAufCent(-5n, -2n)).toBe(3n);
    expect(rundeAufCent(4n, 2n)).toBe(2n);
    expect(rundeAufCent(3n, 2n)).toBe(2n);
    expect(rundeAufCent(1n, 3n)).toBe(0n);
  });

  it('wirft bei Division durch null', () => {
    expect(() => rundeAufCent(1n, 0n)).toThrow(DezimalFehler);
  });
});

describe('wert', () => {
  it('multipliziert Menge und Kurs und rundet einmal am Ende', () => {
    // 2 Stueck zu 10,50 EUR
    expect(wert(zuMengeE8('2'), zuKursE6('10.50'))).toBe(2100n);
  });

  it('rundet nicht zwischendurch', () => {
    // 3 x 0,333333 = 0,999999 -> 1,00 EUR, nicht 3 x 0,33 = 0,99.
    expect(wert(zuMengeE8('3'), zuKursE6('0.333333'))).toBe(100n);
  });

  it('behaelt das Vorzeichen einer negativen Menge', () => {
    expect(wert(zuMengeE8('-2'), zuKursE6('10'))).toBe(-2000n);
  });

  it('bleibt bei Bruchteilen exakt', () => {
    expect(wert(zuMengeE8('0.12345678'), zuKursE6('987.654321'))).toBe(12193n);
  });
});

describe('anteil', () => {
  it('teilt und nennt null als null', () => {
    expect(anteil(2500n, 10_000n)).toBeCloseTo(0.25, 12);
    expect(anteil(1n, 0n)).toBe(0);
  });
});

describe('summe, betragVon, alsText', () => {
  it('summiert ohne Zwischenrundung', () => {
    expect(summe([1n, 2n, 3n])).toBe(6n);
    expect(summe([])).toBe(0n);
  });

  it('nimmt den Betrag', () => {
    expect(betragVon(-7n)).toBe(7n);
    expect(betragVon(7n)).toBe(7n);
    expect(betragVon(0n)).toBe(0n);
  });

  it('schreibt bigint dezimal, ohne Suffix', () => {
    expect(alsText(-1234n)).toBe('-1234');
    expect(alsText(0n)).toBe('0');
  });
});

describe('euroText', () => {
  it('schreibt Cent als Eurobetrag mit zwei Stellen', () => {
    expect(euroText(37805n)).toBe('378,05');
    expect(euroText(5n)).toBe('0,05');
    expect(euroText(0n)).toBe('0,00');
    expect(euroText(100n)).toBe('1,00');
  });

  it('stellt das Minus voran, nicht mittenhinein', () => {
    expect(euroText(-37805n)).toBe('-378,05');
    expect(euroText(-5n)).toBe('-0,05');
  });

  it('bleibt jenseits der sicheren Fliesskommazahl exakt', () => {
    // Ueber 2^53 Cent: `(Number(c) / 100).toFixed(2)` faenge hier an zu runden.
    expect(euroText(9007199254740993n)).toBe('90071992547409,93');
  });
});
