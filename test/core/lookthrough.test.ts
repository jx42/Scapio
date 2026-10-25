import { describe, expect, it } from 'vitest';
import { zuCent } from '../../core/dezimal.ts';
import type { Bestandteil } from '../../core/lookthrough.ts';
import { LEERES_ERGEBNIS, gewichtsSumme, lookThrough } from '../../core/lookthrough.ts';
import type { Cent } from '../../core/dezimal.ts';
import type { Isin } from '../../core/typen.ts';
import { EUROPA, GOLD, WELT } from '../hilfen.ts';

const teil = (fondsIsin: Isin, unternehmenIsin: string, name: string, gewicht: number, sektor: string | null = null, land: string | null = null): Bestandteil => ({
  fondsIsin,
  unternehmenIsin,
  name,
  gewicht,
  sektor,
  land,
});

const werte = (eintraege: readonly (readonly [Isin, string])[]): Map<Isin, Cent> =>
  new Map(eintraege.map(([isin, betrag]) => [isin, zuCent(betrag)]));

describe('lookThrough', () => {
  it('rechnet Fondswert mal Gewicht', () => {
    const e = lookThrough(werte([[WELT, '1000']]), [teil(WELT, 'US0378331005', 'Apple', 0.05)], zuCent('1000'));
    expect(e.top[0]!.exposure).toBe(zuCent('50'));
    expect(e.top[0]!.anteilDepot).toBeCloseTo(0.05, 12);
  });

  it('addiert dasselbe Unternehmen ueber mehrere Fonds', () => {
    // Nestlé steckt im World- und im Europe-ETF; erst die Summe zeigt die echte Position.
    const e = lookThrough(
      werte([[WELT, '1000'], [EUROPA, '1000']]),
      [teil(WELT, 'CH0038863350', 'Nestle SA', 0.01), teil(EUROPA, 'CH0038863350', 'Nestlé S.A.', 0.03)],
      zuCent('2000'),
    );
    expect(e.top).toHaveLength(1);
    expect(e.top[0]!.exposure).toBe(zuCent('40'));
    expect(e.top[0]!.ausFonds).toEqual([
      { isin: EUROPA, anteil: zuCent('30') },
      { isin: WELT, anteil: zuCent('10') },
    ]);
  });

  it('aggregiert ueber die ISIN, nie ueber den Namen', () => {
    // Derselbe Name, zwei Unternehmen: sie duerfen nicht zusammenfallen.
    const e = lookThrough(
      werte([[WELT, '1000']]),
      [teil(WELT, 'US0378331005', 'Alphabet', 0.02), teil(WELT, 'US02079K1079', 'Alphabet', 0.03)],
      zuCent('1000'),
    );
    expect(e.top).toHaveLength(2);
  });

  it('nimmt den Namen der ersten Fundstelle', () => {
    const e = lookThrough(
      werte([[WELT, '1000'], [EUROPA, '1000']]),
      [teil(WELT, 'CH0038863350', 'Nestle SA', 0.01), teil(EUROPA, 'CH0038863350', 'Nestlé S.A.', 0.03)],
      zuCent('2000'),
    );
    expect(e.top[0]!.name).toBe('Nestle SA');
  });

  it('sortiert absteigend nach Exposure und schneidet bei der Grenze ab', () => {
    const bestandteile = Array.from({ length: 30 }, (_, i) => teil(WELT, `X${String(i).padStart(11, '0')}`, `Nr ${i}`, (i + 1) / 1000));
    const e = lookThrough(werte([[WELT, '100000']]), bestandteile, zuCent('100000'), 25);
    expect(e.top).toHaveLength(25);
    expect(e.top[0]!.name).toBe('Nr 29');
    for (let i = 1; i < e.top.length; i += 1) {
      expect(e.top[i - 1]!.exposure >= e.top[i]!.exposure).toBe(true);
    }
    expect(e.anzahlUnternehmen).toBe(30);

    // topAnteil summiert nur die 25 gezeigten Zeilen, nicht alle 30 gefundenen.
    const summeTop = e.top.reduce((s, z) => s + z.anteilDepot, 0);
    expect(e.topAnteil).toBeCloseTo(summeTop, 12);
    expect(e.topAnteil).toBeLessThan(e.abdeckung);
  });

  it('zaehlt anzahlUnternehmen ueber die ISIN dedupliziert, unabhaengig von der Grenze', () => {
    // Nestlé steckt in beiden Fonds, zaehlt aber nur einmal.
    const e = lookThrough(
      werte([[WELT, '1000'], [EUROPA, '1000']]),
      [teil(WELT, 'CH0038863350', 'Nestle SA', 0.01), teil(EUROPA, 'CH0038863350', 'Nestlé S.A.', 0.03)],
      zuCent('2000'),
    );
    expect(e.anzahlUnternehmen).toBe(1);
  });

  it('nennt die Abdeckung, statt Gold und Cash zu verschweigen', () => {
    // Ohne die Quote waeren die Prozentwerte irrefuehrend.
    const e = lookThrough(
      werte([[WELT, '7500'], [GOLD, '2500']]),
      [teil(WELT, 'US0378331005', 'Apple', 0.05)],
      zuCent('10000'),
    );
    expect(e.durchschautCent).toBe(zuCent('7500'));
    expect(e.abdeckung).toBeCloseTo(0.75, 12);
  });

  it('zaehlt einen Fonds ohne Wert nicht zur Abdeckung', () => {
    const e = lookThrough(werte([[WELT, '0']]), [teil(WELT, 'US0378331005', 'Apple', 0.05)], zuCent('1000'));
    expect(e.top).toEqual([]);
    expect(e.abdeckung).toBe(0);
  });

  it('uebergeht Bestandteile eines Fonds, den das Depot nicht haelt', () => {
    const e = lookThrough(werte([[WELT, '1000']]), [teil(EUROPA, 'US0378331005', 'Apple', 0.05)], zuCent('1000'));
    expect(e.top).toEqual([]);
    expect(e.durchschautCent).toBe(0n);
  });

  it('verwirft einen Bestandteil, dessen Anteil auf null Cent rundet', () => {
    // Ein winziges Gewicht auf einen winzigen Fondswert ergibt weniger als einen
    // halben Cent — das zaehlt nicht als Position, aber der Fonds bleibt "durchschaut".
    const e = lookThrough(werte([[WELT, '0.01']]), [teil(WELT, 'US0378331005', 'Winzig', 0.001)], zuCent('0.01'));
    expect(e.top).toEqual([]);
    expect(e.durchschautCent).toBe(zuCent('0.01'));
  });

  it('sortiert die Fonds-Anteile eines Unternehmens absteigend, auch wenn der groessere zuerst kam', () => {
    // Umgekehrte Reihenfolge zum Test "addiert dasselbe Unternehmen ueber mehrere
    // Fonds": hier liefert der zuerst verarbeitete Fonds bereits den groesseren Anteil.
    const e = lookThrough(
      werte([[WELT, '1000'], [EUROPA, '1000']]),
      [teil(WELT, 'CH0038863350', 'Nestle SA', 0.03), teil(EUROPA, 'CH0038863350', 'Nestle SA', 0.01)],
      zuCent('2000'),
    );
    expect(e.top[0]!.ausFonds).toEqual([
      { isin: WELT, anteil: zuCent('30') },
      { isin: EUROPA, anteil: zuCent('10') },
    ]);
  });

  it('bricht bei gleicher Exposure den Gleichstand ueber die Unternehmens-ISIN', () => {
    const e = lookThrough(
      werte([[WELT, '1000']]),
      [teil(WELT, 'US5949181045', 'Microsoft', 0.02), teil(WELT, 'US0378331005', 'Apple', 0.02)],
      zuCent('1000'),
    );
    expect(e.top.map((u) => u.unternehmenIsin)).toEqual(['US0378331005', 'US5949181045']);
  });

  it('behandelt zwei Unternehmen mit sinkender Exposure in Verarbeitungsreihenfolge', () => {
    // Gegenstueck zum Gleichstand: hier ist die Exposure klar unterschiedlich, und
    // das zuerst verarbeitete Unternehmen ist bereits das groessere der beiden.
    const e = lookThrough(
      werte([[WELT, '1000']]),
      [teil(WELT, 'US5949181045', 'Microsoft', 0.03), teil(WELT, 'US0378331005', 'Apple', 0.01)],
      zuCent('1000'),
    );
    expect(e.top.map((u) => u.unternehmenIsin)).toEqual(['US5949181045', 'US0378331005']);
  });

  it('bricht den Gleichstand auch, wenn die kleinere ISIN zuerst verarbeitet wird', () => {
    // Spiegelbild zum ersten Gleichstand-Test: dort kam die groessere ISIN zuerst,
    // hier die kleinere — beide Reihenfolgen der Unternehmens-ISIN muessen greifen.
    const e = lookThrough(
      werte([[WELT, '1000']]),
      [teil(WELT, 'US0378331005', 'Apple', 0.02), teil(WELT, 'US5949181045', 'Microsoft', 0.02)],
      zuCent('1000'),
    );
    expect(e.top.map((u) => u.unternehmenIsin)).toEqual(['US0378331005', 'US5949181045']);
  });

  it('laesst zwei Fonds-Anteile desselben Unternehmens bei Gleichstand in Reihenfolge', () => {
    // Beide Fonds tragen exakt denselben Centbetrag zum selben Unternehmen bei —
    // der Sortiervergleich der ausFonds-Liste liefert dann Gleichstand.
    const e = lookThrough(
      werte([[WELT, '1000'], [EUROPA, '1000']]),
      [teil(WELT, 'CH0038863350', 'Nestle SA', 0.01), teil(EUROPA, 'CH0038863350', 'Nestle SA', 0.01)],
      zuCent('2000'),
    );
    expect(e.top[0]!.ausFonds).toHaveLength(2);
    expect(e.top[0]!.ausFonds.map((f) => f.anteil)).toEqual([zuCent('10'), zuCent('10')]);
  });

  it('uebergeht unbrauchbare Gewichte, ohne die Rechnung zu verlieren', () => {
    const e = lookThrough(
      werte([[WELT, '1000']]),
      [
        teil(WELT, 'US0378331005', 'Apple', 0.05),
        teil(WELT, 'US5949181045', 'Microsoft', 0),
        teil(WELT, 'US67066G1040', 'Nvidia', Number.NaN),
        teil(WELT, 'US0231351067', 'Amazon', -0.1),
      ],
      zuCent('1000'),
    );
    expect(e.top).toHaveLength(1);
    expect(e.top[0]!.name).toBe('Apple');
  });

  it('teilt nicht durch einen Depotwert von null', () => {
    const e = lookThrough(werte([[WELT, '1000']]), [teil(WELT, 'US0378331005', 'Apple', 0.05)], 0n);
    expect(e.abdeckung).toBe(0);
    expect(e.top[0]!.anteilDepot).toBe(0);
  });

  it('ergibt aus nichts das leere Ergebnis', () => {
    expect(lookThrough(new Map(), [], 0n)).toEqual(LEERES_ERGEBNIS);
  });

  it('traegt Sektor und Land der ersten Fundstelle mit', () => {
    const e = lookThrough(
      werte([[WELT, '1000']]),
      [teil(WELT, 'US0378331005', 'Apple', 0.05, 'Technologie', 'Vereinigte Staaten')],
      zuCent('1000'),
    );
    expect(e.top[0]!.sektor).toBe('Technologie');
    expect(e.top[0]!.land).toBe('Vereinigte Staaten');
  });
});

describe('lookThrough: Laender und Sektoren', () => {
  it('summiert ueber alle Bestandteile und Fonds, bezogen auf das durchschaute Exposure', () => {
    const e = lookThrough(
      werte([[WELT, '1000'], [EUROPA, '1000'], [GOLD, '2000']]),
      [
        teil(WELT, 'A', 'a', 0.6, 'Financials', 'United States'),
        teil(WELT, 'B', 'b', 0.4, 'Health Care', ' Switzerland '),
        teil(EUROPA, 'B', 'b', 0.5, 'Health Care', 'Switzerland'),
        teil(EUROPA, 'C', 'c', 0.5, 'Financials', 'Germany'),
      ],
      zuCent('4000'),
      1,
    );
    // Ueber alle Unternehmen, nicht nur die eine Top-Zeile; Gold zaehlt nicht mit.
    expect(e.laender).toEqual([
      { name: 'Switzerland', exposure: zuCent('900'), anteil: 0.45 },
      { name: 'United States', exposure: zuCent('600'), anteil: 0.3 },
      { name: 'Germany', exposure: zuCent('500'), anteil: 0.25 },
    ]);
    expect(e.sektoren).toEqual([
      { name: 'Financials', exposure: zuCent('1100'), anteil: 0.55 },
      { name: 'Health Care', exposure: zuCent('900'), anteil: 0.45 },
    ]);
  });

  it('fasst alles jenseits der zehn groessten Gruppen und alles ohne Angabe als null zusammen', () => {
    const laender = Array.from({ length: 12 }, (_, i) => `L${String(i + 1)}`);
    const e = lookThrough(
      werte([[WELT, '1000']]),
      [
        ...laender.map((land, i) => teil(WELT, `U${String(i)}`, land, (laender.length - i) / 100, null, land)),
        teil(WELT, 'X', 'x', 0.02, null, '  '),
      ],
      zuCent('1000'),
    );
    expect(e.laender.map((g) => g.name)).toEqual([...laender.slice(0, 10), null]);
    // L11 (2 %), L12 (1 %) und die leere Angabe (2 %).
    expect(e.laender.at(-1)!.exposure).toBe(zuCent('50'));
    expect(e.sektoren).toEqual([{ name: null, exposure: zuCent('800'), anteil: 1 }]);
  });
});

describe('gewichtsSumme', () => {
  it('summiert nur die Gewichte des gefragten Fonds', () => {
    const bestandteile = [teil(WELT, 'A', 'a', 0.6), teil(WELT, 'B', 'b', 0.4), teil(EUROPA, 'C', 'c', 1)];
    expect(gewichtsSumme(bestandteile, WELT)).toBeCloseTo(1, 12);
    expect(gewichtsSumme(bestandteile, GOLD)).toBe(0);
  });
});
