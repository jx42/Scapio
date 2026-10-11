import { describe, expect, it } from 'vitest';
import { zuKursE6 } from '../../core/dezimal.ts';
import type { Kurspunkt } from '../../core/kursraster.ts';
import {
  FUELL_GRENZE_TAGE,
  RANG,
  SPRUNG_SCHWELLE,
  letzterKursBis,
  markiereSpruenge,
  rasterFuer,
  verschmelzeKurse,
} from '../../core/kursraster.ts';
import { EUROPA, T, WELT } from '../hilfen.ts';

const p = (
  tag: string,
  kurs: string,
  herkunft: Kurspunkt['herkunft'] = 'chart_max',
  isin = WELT,
  abgerufenAm?: string,
): Kurspunkt => ({ isin, tag: T(tag), kurs: zuKursE6(kurs), herkunft, ...(abgerufenAm ? { abgerufenAm } : {}) });

describe('RANG', () => {
  it('stellt den Transaktionskurs ueber jedes Chartfenster', () => {
    expect(RANG.transaktion).toBeGreaterThan(RANG.chart_1m);
    expect(RANG.chart_1m).toBeGreaterThan(RANG.chart_3m);
    expect(RANG.chart_3m).toBeGreaterThan(RANG.chart_1y);
    expect(RANG.chart_1y).toBeGreaterThan(RANG.chart_max);
  });
});

describe('verschmelzeKurse', () => {
  it('laesst den feineren Punkt gewinnen, egal in welcher Reihenfolge er kommt', () => {
    const grob = p('2026-01-05', '100', 'chart_max');
    const fein = p('2026-01-05', '101', 'chart_1m');

    for (const reihenfolge of [[grob, fein], [fein, grob]]) {
      const ergebnis = verschmelzeKurse(reihenfolge);
      expect(ergebnis).toHaveLength(1);
      expect(ergebnis[0]!.kurs).toBe(zuKursE6('101'));
      expect(ergebnis[0]!.herkunft).toBe('chart_1m');
    }
  });

  it('laesst den Transaktionskurs jeden Chartpunkt schlagen', () => {
    const ergebnis = verschmelzeKurse([
      p('2026-01-05', '101', 'chart_1m'),
      p('2026-01-05', '100.37', 'transaktion'),
    ]);
    expect(ergebnis[0]!.kurs).toBe(zuKursE6('100.37'));
  });

  it('nimmt bei Rangegleichstand den zuletzt abgerufenen Punkt', () => {
    const ergebnis = verschmelzeKurse([
      p('2026-01-05', '100', 'chart_1m', WELT, '2026-01-06T08:00:00Z'),
      p('2026-01-05', '102', 'chart_1m', WELT, '2026-01-07T08:00:00Z'),
    ]);
    expect(ergebnis[0]!.kurs).toBe(zuKursE6('102'));
  });

  it('behandelt einen fehlenden Abrufzeitpunkt bei Rangegleichstand als leer', () => {
    // Weder der erste noch der zweite Punkt nennt, wann er abgerufen wurde — beide
    // Seiten des Vergleichs fallen auf '' zurueck, und der zuletzt genannte gewinnt.
    const ergebnis = verschmelzeKurse([
      p('2026-01-05', '100', 'chart_1m'),
      p('2026-01-05', '102', 'chart_1m'),
    ]);
    expect(ergebnis[0]!.kurs).toBe(zuKursE6('102'));
  });

  it('trennt nach ISIN und sortiert nach ISIN und Tag', () => {
    const ergebnis = verschmelzeKurse([
      p('2026-01-06', '1', 'chart_max', WELT),
      p('2026-01-05', '2', 'chart_max', WELT),
      p('2026-01-05', '3', 'chart_max', EUROPA),
    ]);
    expect(ergebnis.map((k) => `${k.isin} ${k.tag}`)).toEqual([
      `${EUROPA} 2026-01-05`,
      `${WELT} 2026-01-05`,
      `${WELT} 2026-01-06`,
    ]);
  });

  it('ergibt nichts aus nichts', () => {
    expect(verschmelzeKurse([])).toEqual([]);
  });

  it('setzt eine alphabetisch spaetere ISIN hinter eine fruehere, auch wenn sie zuerst kommt', () => {
    const ergebnis = verschmelzeKurse([
      p('2026-01-05', '3', 'chart_max', EUROPA),
      p('2026-01-05', '1', 'chart_max', WELT),
    ]);
    expect(ergebnis.map((k) => k.isin)).toEqual([EUROPA, WELT]);
  });
});

describe('rasterFuer', () => {
  it('fuellt ein Wochenende aus dem Freitagskurs', () => {
    const raster = rasterFuer([p('2026-01-02', '100')], T('2026-01-02'), T('2026-01-05'));
    expect(raster.get(T('2026-01-02'))).toEqual({ kurs: zuKursE6('100'), gefuellt: false });
    expect(raster.get(T('2026-01-03'))).toEqual({ kurs: zuKursE6('100'), gefuellt: true });
    expect(raster.get(T('2026-01-04'))).toEqual({ kurs: zuKursE6('100'), gefuellt: true });
    expect(raster.get(T('2026-01-05'))).toEqual({ kurs: zuKursE6('100'), gefuellt: true });
  });

  it('fuellt genau bis zur Grenze und keinen Tag weiter', () => {
    const raster = rasterFuer([p('2026-01-01', '100')], T('2026-01-01'), T('2026-01-10'));
    for (let i = 1; i <= FUELL_GRENZE_TAGE; i += 1) {
      const tag = T(`2026-01-0${String(i + 1)}`);
      expect(raster.get(tag), tag).toEqual({ kurs: zuKursE6('100'), gefuellt: true });
    }
    expect(raster.has(T('2026-01-07'))).toBe(false);
    expect(raster.has(T('2026-01-10'))).toBe(false);
  });

  it('faengt nach einer langen Luecke wieder an zu fuellen', () => {
    const raster = rasterFuer([p('2026-01-01', '100'), p('2026-01-20', '110')], T('2026-01-01'), T('2026-01-22'));
    expect(raster.has(T('2026-01-15'))).toBe(false);
    expect(raster.get(T('2026-01-20'))).toEqual({ kurs: zuKursE6('110'), gefuellt: false });
    expect(raster.get(T('2026-01-21'))).toEqual({ kurs: zuKursE6('110'), gefuellt: true });
  });

  it('fuellt nicht rueckwaerts', () => {
    const raster = rasterFuer([p('2026-01-05', '100')], T('2026-01-01'), T('2026-01-05'));
    expect(raster.has(T('2026-01-04'))).toBe(false);
    expect(raster.has(T('2026-01-05'))).toBe(true);
  });

  it('ergibt ein leeres Raster ohne Punkte', () => {
    expect(rasterFuer([], T('2026-01-01'), T('2026-01-05')).size).toBe(0);
  });

  it('ignoriert Punkte ausserhalb der Spanne, nutzt aber ihren Nachhall nicht', () => {
    const raster = rasterFuer([p('2026-02-01', '100')], T('2026-01-01'), T('2026-01-05'));
    expect(raster.size).toBe(0);
  });
});

describe('letzterKursBis', () => {
  it('nimmt den letzten Punkt vor oder an dem Tag, ohne Fuellgrenze', () => {
    const punkte = [p('2026-01-01', '100'), p('2026-03-01', '120')];
    expect(letzterKursBis(punkte, T('2026-02-15'))).toBe(zuKursE6('100'));
    expect(letzterKursBis(punkte, T('2026-03-01'))).toBe(zuKursE6('120'));
    expect(letzterKursBis(punkte, T('2025-12-31'))).toBeNull();
    expect(letzterKursBis([], T('2026-01-01'))).toBeNull();
  });
});

describe('markiereSpruenge', () => {
  it('markiert einen Sprung ueber der Schwelle, lehnt ihn aber nicht ab', () => {
    const auffaellig = markiereSpruenge([p('2026-01-01', '100', 'chart_1m'), p('2026-01-02', '140', 'chart_1m')]);
    expect(auffaellig.has(`${WELT} 2026-01-02`)).toBe(true);
    expect(auffaellig.has(`${WELT} 2026-01-01`)).toBe(false);
  });

  it('laesst eine Bewegung genau auf der Schwelle durch', () => {
    const auffaellig = markiereSpruenge([
      p('2026-01-01', '100', 'chart_1m'),
      p('2026-01-02', String(100 * (1 + SPRUNG_SCHWELLE)), 'chart_1m'),
    ]);
    expect(auffaellig.size).toBe(0);
  });

  it('markiert auch einen Sturz', () => {
    const auffaellig = markiereSpruenge([p('2026-01-01', '100', 'chart_1m'), p('2026-01-02', '50', 'chart_1m')]);
    expect(auffaellig.has(`${WELT} 2026-01-02`)).toBe(true);
  });

  it('vergleicht nur innerhalb derselben ISIN', () => {
    const auffaellig = markiereSpruenge([p('2026-01-01', '100', 'chart_1m', WELT), p('2026-01-02', '5', 'chart_1m', EUROPA)]);
    expect(auffaellig.size).toBe(0);
  });

  it('teilt nicht durch einen Kurs von null', () => {
    const auffaellig = markiereSpruenge([p('2026-01-01', '0', 'chart_1m'), p('2026-01-02', '100', 'chart_1m')]);
    expect(auffaellig.size).toBe(0);
  });

  it('sortiert selbst, bevor es vergleicht', () => {
    const auffaellig = markiereSpruenge([p('2026-01-02', '140', 'chart_1m'), p('2026-01-01', '100', 'chart_1m')]);
    expect(auffaellig.has(`${WELT} 2026-01-02`)).toBe(true);
  });

  it('ignoriert chart_max — das Fenster loest nur monatlich auf, kein echter Tagessprung', () => {
    const auffaellig = markiereSpruenge([p('2026-01-01', '100', 'chart_max'), p('2026-01-02', '140', 'chart_max')]);
    expect(auffaellig.size).toBe(0);
  });

  it('ignoriert einen chart_max-Punkt auch als Vorgaenger eines feineren Punkts', () => {
    const auffaellig = markiereSpruenge([p('2026-01-01', '100', 'chart_max'), p('2026-01-02', '140', 'chart_1m')]);
    expect(auffaellig.size).toBe(0);
  });
});
