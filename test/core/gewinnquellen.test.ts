import { describe, expect, it } from 'vitest';
import { zuCent } from '../../core/dezimal.ts';
import { HOECHSTENS_JE_SEITE, gewinnquellen, type PositionsBeitrag } from '../../core/gewinnquellen.ts';
import type { Isin } from '../../core/typen.ts';

function position(nr: number, euro: string): PositionsBeitrag {
  const isin = `DE${String(nr).padStart(10, '0')}` as Isin;
  return { isin, name: `Position ${nr}`, gewinnCent: zuCent(euro) };
}

const OHNE_TOEPFE = { ertraegeCent: 0n, steuernCent: 0n, gebuehrenCent: 0n };

describe('gewinnquellen', () => {
  it('teilt nach Vorzeichen: Gewinne fliessen zu, Verluste und Abzuege ab', () => {
    const g = gewinnquellen({
      positionen: [position(1, '900'), position(2, '-100'), position(3, '300')],
      ertraegeCent: zuCent('50'),
      steuernCent: zuCent('-40'),
      gebuehrenCent: zuCent('-10'),
    });
    expect(g.zufluesse.map((q) => [q.art, q.betragCent])).toEqual([
      ['position', zuCent('900')],
      ['position', zuCent('300')],
      ['ertraege', zuCent('50')],
    ]);
    expect(g.abfluesse.map((q) => [q.art, q.betragCent])).toEqual([
      ['position', zuCent('-100')],
      ['steuern', zuCent('-40')],
      ['gebuehren', zuCent('-10')],
    ]);
    expect(g.bruttoCent).toBe(zuCent('1250'));
    expect(g.abzuegeCent).toBe(zuCent('-150'));
    expect(g.nettoCent).toBe(zuCent('1100'));
    expect(g.mitteCent).toBe(zuCent('1250'));
    expect(g.nettoAnteil).toBeCloseTo(1100 / 1250, 12);
    expect(g.zufluesse[0]?.anteil).toBeCloseTo(900 / 1250, 12);
    expect(g.abfluesse[0]?.anteil).toBeCloseTo(100 / 1250, 12);
  });

  it('nimmt bei einem Nettoverlust die Abzuege als Mitte', () => {
    const g = gewinnquellen({ positionen: [position(1, '100'), position(2, '-400')], ...OHNE_TOEPFE });
    expect(g.nettoCent).toBe(zuCent('-300'));
    expect(g.mitteCent).toBe(zuCent('400'));
    expect(g.nettoAnteil).toBeCloseTo(0.75, 12);
  });

  it('laesst Nullbetraege weg', () => {
    const g = gewinnquellen({ positionen: [position(1, '0')], ...OHNE_TOEPFE });
    expect(g.zufluesse).toEqual([]);
    expect(g.abfluesse).toEqual([]);
    expect(g.mitteCent).toBe(0n);
    expect(g.nettoAnteil).toBe(0);
  });

  it('ordnet eine Steuererstattung den Zufluessen zu', () => {
    const g = gewinnquellen({ positionen: [], ertraegeCent: 0n, steuernCent: zuCent('20'), gebuehrenCent: 0n });
    expect(g.zufluesse.map((q) => q.art)).toEqual(['steuern']);
  });

  it('fasst ueberzaehlige Positionen je Seite zusammen, ohne die Summe zu aendern', () => {
    const positionen = Array.from({ length: HOECHSTENS_JE_SEITE + 3 }, (_, i) => position(i + 1, String((i + 1) * 10)));
    const g = gewinnquellen({ positionen, ...OHNE_TOEPFE, ertraegeCent: zuCent('5') });
    expect(g.zufluesse).toHaveLength(HOECHSTENS_JE_SEITE + 1);
    const uebrige = g.zufluesse.find((q) => q.art === 'uebrige');
    expect(uebrige?.anzahl).toBe(4);
    expect(uebrige?.isins).toHaveLength(4);
    expect(uebrige?.betragCent).toBe(zuCent(String(10 + 20 + 30 + 40)));
    expect(g.zufluesse.at(-1)?.art).toBe('ertraege');
    expect(g.bruttoCent).toBe(zuCent(String((11 * 12 * 10) / 2 + 5)));
  });

  it('sortiert gleich grosse Betraege stabil nach ISIN', () => {
    const g = gewinnquellen({ positionen: [position(2, '10'), position(1, '10')], ...OHNE_TOEPFE });
    expect(g.zufluesse.map((q) => q.isin)).toEqual([position(1, '0').isin, position(2, '0').isin]);
  });
});
