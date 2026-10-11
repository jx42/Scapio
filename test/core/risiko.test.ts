import { describe, expect, it } from 'vitest';
import {
  MIN_MONATE,
  maxDrawdown,
  monatsrenditen,
  sharpeRatio,
  volatilitaetProJahr,
  type Monatsrendite,
  type Zinsreihe,
} from '../../core/risiko.ts';
import { T } from '../hilfen.ts';

const R = (monat: string, rendite: number): Monatsrendite => ({ monat, rendite });

const HEUTE = T('2026-12-31');

describe('monatsrenditen', () => {
  it('liefert nichts fuer einen leeren Index', () => {
    expect(monatsrenditen([], HEUTE)).toEqual([]);
  });

  it('liefert nichts, wenn nur ein Monat vorkommt — es gibt keinen Vormonat', () => {
    const index = [{ tag: T('2026-01-15'), wert: 100 }, { tag: T('2026-01-31'), wert: 105 }];
    expect(monatsrenditen(index, HEUTE)).toEqual([]);
  });

  it('nimmt je Monat den letzten Indexwert und bildet die Rendite zum Vormonat', () => {
    const index = [
      { tag: T('2026-01-15'), wert: 100 },
      { tag: T('2026-01-31'), wert: 105 },
      { tag: T('2026-02-28'), wert: 110 },
      { tag: T('2026-03-31'), wert: 99 },
    ];
    const renditen = monatsrenditen(index, HEUTE);
    expect(renditen).toHaveLength(2);
    expect(renditen[0]!.monat).toBe('2026-02');
    expect(renditen[0]!.rendite).toBeCloseTo(110 / 105 - 1, 12);
    expect(renditen[1]!.monat).toBe('2026-03');
    expect(renditen[1]!.rendite).toBeCloseTo(99 / 110 - 1, 12);
  });

  it('laesst den laufenden Teilmonat weg, bis er vorbei ist [ADR-043]', () => {
    const index = [
      { tag: T('2026-01-31'), wert: 100 },
      { tag: T('2026-02-28'), wert: 110 },
      { tag: T('2026-03-12'), wert: 120 },
    ];
    expect(monatsrenditen(index, T('2026-03-12')).map((r) => r.monat)).toEqual(['2026-02']);
    expect(monatsrenditen(index, T('2026-03-31')).map((r) => r.monat)).toEqual(['2026-02', '2026-03']);
  });

  it('ueberspringt einen Monat, dessen Vormonat auf Null steht — kein sinnvolles Verhaeltnis', () => {
    const index = [
      { tag: T('2026-01-31'), wert: 0 },
      { tag: T('2026-02-28'), wert: 50 },
    ];
    expect(monatsrenditen(index, HEUTE)).toEqual([]);
  });
});

describe('maxDrawdown', () => {
  it('ist nicht berechenbar mit weniger als zwei Indexpunkten', () => {
    expect(maxDrawdown([])).toEqual({ art: 'zu_wenig_daten' });
    expect(maxDrawdown([{ tag: T('2026-01-01'), wert: 100 }])).toEqual({ art: 'zu_wenig_daten' });
  });

  it('bleibt bei null, wenn der Index nur steigt', () => {
    const index = [
      { tag: T('2026-01-01'), wert: 100 },
      { tag: T('2026-01-02'), wert: 110 },
      { tag: T('2026-01-03'), wert: 120 },
    ];
    expect(maxDrawdown(index)).toEqual({
      art: 'ok',
      anteil: 0,
      tagHoch: T('2026-01-01'),
      tagTief: T('2026-01-01'),
    });
  });

  it('findet den groessten Rueckgang, auch wenn er inzwischen wieder aufgeholt wurde', () => {
    const index = [
      { tag: T('2026-01-01'), wert: 100 },
      { tag: T('2026-02-01'), wert: 150 }, // neues Hoch
      { tag: T('2026-03-01'), wert: 90 }, // schlimmster Einbruch: -40 %
      { tag: T('2026-04-01'), wert: 130 }, // Teilerholung, noch unter dem alten Hoch
      { tag: T('2026-05-01'), wert: 160 }, // neues Hoch
      { tag: T('2026-06-01'), wert: 150 }, // milderer Rueckgang, nicht der schlimmste
    ];
    const ergebnis = maxDrawdown(index);
    expect(ergebnis.art).toBe('ok');
    if (ergebnis.art !== 'ok') throw new Error('unreachable');
    expect(ergebnis.anteil).toBeCloseTo(-0.4, 12);
    expect(ergebnis.tagHoch).toBe(T('2026-02-01'));
    expect(ergebnis.tagTief).toBe(T('2026-03-01'));
  });
});

describe('volatilitaetProJahr', () => {
  it('ist nicht berechenbar mit weniger als zwoelf Monatsrenditen', () => {
    const renditen = Array.from({ length: MIN_MONATE - 1 }, (_, i) => R(`2026-${String(i + 1).padStart(2, '0')}`, 0.01));
    expect(volatilitaetProJahr(renditen)).toEqual({ art: 'zu_wenig_daten' });
  });

  it('ist null, wenn jeder Monat dieselbe Rendite bringt — keine Streuung', () => {
    const renditen = Array.from({ length: MIN_MONATE }, (_, i) => R(`2026-${String(i + 1).padStart(2, '0')}`, 0.015));
    const ergebnis = volatilitaetProJahr(renditen);
    expect(ergebnis.art).toBe('ok');
    if (ergebnis.art !== 'ok') throw new Error('unreachable');
    expect(ergebnis.proJahr).toBeCloseTo(0, 12);
    expect(ergebnis.monate).toBe(MIN_MONATE);
  });

  it('rechnet die Stichproben-Standardabweichung korrekt auf das Jahr hoch', () => {
    // Sechs Monate bei +2 %, sechs bei 0 %: symmetrisch um den Mittelwert (1 %), die
    // Abweichung jedes Monats betraegt exakt 1 Prozentpunkt — daraus laesst sich die
    // erwartete Volatilitaet in geschlossener Form herleiten, unabhaengig vom Code hier.
    const renditen = [
      ...Array.from({ length: 6 }, (_, i) => R(`2026-0${i + 1}`, 0.02)),
      ...Array.from({ length: 6 }, (_, i) => R(`2026-${i + 7}`, 0)),
    ];
    const ergebnis = volatilitaetProJahr(renditen);
    expect(ergebnis.art).toBe('ok');
    if (ergebnis.art !== 'ok') throw new Error('unreachable');
    const erwartet = (0.01 * 12) / Math.sqrt(11);
    expect(ergebnis.proJahr).toBeCloseTo(erwartet, 10);
    expect(ergebnis.monate).toBe(12);
  });
});

describe('sharpeRatio', () => {
  it('fehlt der risikofreie Zins ganz, ist auch die Sharpe-Ratio nicht berechenbar', () => {
    expect(sharpeRatio([], new Map())).toEqual({ art: 'kein_zins' });
    expect(sharpeRatio([R('2026-01', 0.01)], new Map())).toEqual({ art: 'kein_zins' });
  });

  it('zaehlt nur Monate mit echtem Zins mit — bei weniger als zwoelf Treffern nicht berechenbar', () => {
    const renditen = Array.from({ length: 12 }, (_, i) => R(`2026-${String(i + 1).padStart(2, '0')}`, 0.01));
    const zinsreihe: Zinsreihe = new Map(
      Array.from({ length: 5 }, (_, i) => [T(`2026-${String(i + 1).padStart(2, '0')}-15`), 0.024] as const),
    );
    expect(sharpeRatio(renditen, zinsreihe)).toEqual({ art: 'zu_wenig_daten' });
  });

  it('ist nicht berechenbar, wenn die Ueberschussrendite in keinem Monat streut', () => {
    // Rendite exakt gleich dem Monatszins gesetzt (nicht nur numerisch nahe): so ist die
    // Ueberschussrendite jeden Monat bitgenau Null, unabhaengig von
    // Gleitkomma-Rundung bei der Mittelwertbildung.
    const zinsProJahr = 0.024;
    const rendite = zinsProJahr / 12;
    const renditen = Array.from({ length: 12 }, (_, i) => R(`2026-${String(i + 1).padStart(2, '0')}`, rendite));
    const zinsreihe: Zinsreihe = new Map(
      Array.from({ length: 12 }, (_, i) => [T(`2026-${String(i + 1).padStart(2, '0')}-15`), zinsProJahr] as const),
    );
    expect(sharpeRatio(renditen, zinsreihe)).toEqual({ art: 'keine_streuung' });
  });

  it('rechnet Ueberschussrendite geteilt durch ihre Streuung, beides auf das Jahr hochgerechnet', () => {
    // Gleiches Prinzip wie bei der Volatilitaet: sechs Monate mit Ueberschuss 2 %, sechs
    // mit 0 % — Mittelwert 1 %, Abweichung je Monat exakt 1 Prozentpunkt. Zaehler und
    // Nenner sind dadurch beide ein Vielfaches von 0,01, die Ratio kuerzt sich exakt auf
    // sqrt(11).
    const zinsProJahr = 0.024; // 0,2 % im Monat
    const renditen = [
      ...Array.from({ length: 6 }, (_, i) => R(`2026-${String(i + 1).padStart(2, '0')}`, 0.022)),
      ...Array.from({ length: 6 }, (_, i) => R(`2026-${String(i + 7).padStart(2, '0')}`, 0.002)),
    ];
    const zinsreihe: Zinsreihe = new Map(
      Array.from({ length: 12 }, (_, i) => [T(`2026-${String(i + 1).padStart(2, '0')}-15`), zinsProJahr] as const),
    );
    const ergebnis = sharpeRatio(renditen, zinsreihe);
    expect(ergebnis.art).toBe('ok');
    if (ergebnis.art !== 'ok') throw new Error('unreachable');
    expect(ergebnis.wert).toBeCloseTo(Math.sqrt(11), 10);
    expect(ergebnis.monate).toBe(12);
    expect(ergebnis.zinsProJahr).toBeCloseTo(zinsProJahr, 10);
  });

  it('ist unabhaengig von der Einfuegereihenfolge der Zinsreihe', () => {
    const zinsProJahr = 0.024;
    const renditen = [
      ...Array.from({ length: 6 }, (_, i) => R(`2026-${String(i + 1).padStart(2, '0')}`, 0.022)),
      ...Array.from({ length: 6 }, (_, i) => R(`2026-${String(i + 7).padStart(2, '0')}`, 0.002)),
    ];
    const eintraege = Array.from(
      { length: 12 },
      (_, i) => [T(`2026-${String(i + 1).padStart(2, '0')}-15`), zinsProJahr] as const,
    );
    const vorwaerts: Zinsreihe = new Map(eintraege);
    const rueckwaerts: Zinsreihe = new Map([...eintraege].reverse());

    expect(sharpeRatio(renditen, vorwaerts)).toEqual(sharpeRatio(renditen, rueckwaerts));
  });

  it('mittelt den Zins ueber die genutzten Monate, nicht ueber alle Eintraege der Zinsreihe', () => {
    // Sechs Monate mit 2 %, sechs mit 4 % p.a. — Mittel 3 %. Ein Monat mit einem Zins
    // von 10 % ausserhalb des Rendite-Zeitraums (Januar 2025) darf das Mittel nicht
    // verfaelschen, weil fuer ihn keine Monatsrendite vorliegt.
    const renditen = Array.from({ length: 12 }, (_, i) => R(`2026-${String(i + 1).padStart(2, '0')}`, 0.01));
    const eintraege: Array<readonly [ReturnType<typeof T>, number]> = [
      [T('2025-01-15'), 0.1],
      ...Array.from({ length: 6 }, (_, i) => [T(`2026-${String(i + 1).padStart(2, '0')}-15`), 0.02] as const),
      ...Array.from({ length: 6 }, (_, i) => [T(`2026-${String(i + 7).padStart(2, '0')}-15`), 0.04] as const),
    ];
    const zinsreihe: Zinsreihe = new Map(eintraege);

    const ergebnis = sharpeRatio(renditen, zinsreihe);
    expect(ergebnis.art).toBe('ok');
    if (ergebnis.art !== 'ok') throw new Error('unreachable');
    expect(ergebnis.zinsProJahr).toBeCloseTo(0.03, 10);
  });
});
