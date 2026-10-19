import { describe, expect, it } from 'vitest';
import { zuCent } from '../../core/dezimal.ts';
import type { Fluss } from '../../core/typen.ts';
import { GENAUIGKEIT, OBERGRENZE, TAGE_IM_JAHR, UNTERGRENZE, renditeFluesse, xirr } from '../../core/xirr.ts';
import { T, fluss } from '../hilfen.ts';

const rate = (fluesse: readonly Fluss[]): number => {
  const e = xirr(fluesse);
  expect(e.art).toBe('ok');
  return e.art === 'ok' ? e.rate : Number.NaN;
};

describe('xirr', () => {
  it('trifft die Jahresrendite einer einzigen Anlage', () => {
    expect(rate([fluss('2025-01-01', '-1000'), fluss('2026-01-01', '1100')])).toBeCloseTo(0.1, 9);
  });

  it('rechnet unterjaehrig auf das Jahr hoch', () => {
    // Ein halbes Jahr 10 % ergibt aufs Jahr 21 %.
    const r = rate([fluss('2025-01-01', '-1000'), fluss('2025-07-02', '1100')]);
    expect(Math.pow(1 + r, 182 / TAGE_IM_JAHR)).toBeCloseTo(1.1, 6);
  });

  it('gewichtet nach dem Zeitpunkt der Einzahlung', () => {
    const frueh = rate([fluss('2025-01-01', '-1000'), fluss('2025-02-01', '-1000'), fluss('2026-01-01', '2200')]);
    const spaet = rate([fluss('2025-01-01', '-1000'), fluss('2025-11-01', '-1000'), fluss('2026-01-01', '2200')]);
    // Dasselbe Geld, spaeter eingezahlt, ergibt die hoehere Rendite.
    expect(spaet).toBeGreaterThan(frueh);
  });

  it('erkennt einen Verlust', () => {
    expect(rate([fluss('2025-01-01', '-1000'), fluss('2026-01-01', '900')])).toBeCloseTo(-0.1, 9);
  });

  it('faellt bei mehreren Vorzeichenwechseln auf Bisektion zurueck, statt zu divergieren', () => {
    const e = xirr([
      fluss('2020-01-01', '-1000'),
      fluss('2021-01-01', '5000'),
      fluss('2022-01-01', '-6000'),
      fluss('2023-01-01', '2500'),
    ]);
    expect(['ok', 'nicht_konvergiert', 'ausserhalb_bereich']).toContain(e.art);
    if (e.art === 'ok') expect(Number.isFinite(e.rate)).toBe(true);
  });

  it('nennt fehlenden Vorzeichenwechsel beim Namen, statt zu werfen', () => {
    expect(xirr([fluss('2025-01-01', '1000'), fluss('2026-01-01', '1100')])).toEqual({
      art: 'kein_vorzeichenwechsel',
    });
    expect(xirr([fluss('2025-01-01', '-1000'), fluss('2026-01-01', '-500')])).toEqual({
      art: 'kein_vorzeichenwechsel',
    });
  });

  it('behandelt den Totalverlust als fehlenden Vorzeichenwechsel', () => {
    expect(xirr([fluss('2025-01-01', '-1000'), fluss('2026-01-01', '0')]).art).toBe('kein_vorzeichenwechsel');
  });

  it('braucht mindestens zwei Fluesse', () => {
    expect(xirr([]).art).toBe('zu_wenige_fluesse');
    expect(xirr([fluss('2025-01-01', '-1000')]).art).toBe('zu_wenige_fluesse');
  });

  it('nennt eine Rendite jenseits der Obergrenze nicht, statt sie zu erfinden [ADR-043]', () => {
    const e = xirr([fluss('2025-01-01', '-100'), fluss('2026-01-01', '100000')]);
    expect(e.art).toBe('ausserhalb_bereich');
  });

  it('nennt Zahlungen an einem einzigen Tag nicht bestimmbar, statt START_RATE zu melden [ADR-043]', () => {
    expect(xirr([fluss('2025-01-01', '-1000'), fluss('2025-01-01', '1010')])).toEqual({ art: 'nicht_bestimmbar' });
  });

  it('markiert eine Reihe mit mehreren Loesungen als mehrdeutig [ADR-043]', () => {
    // Nullstellen bei 10 % und 20 %: -1000·(1,1)(1,2) = -1320, also -1000 / +2300 / -1320.
    const e = xirr([fluss('2020-01-01', '-1000'), fluss('2021-01-01', '2300'), fluss('2022-01-01', '-1320')]);
    expect(e.art).toBe('ok');
    if (e.art === 'ok') expect(e.mehrdeutig).toBe(true);
  });

  it('haelt einen Sparplan mit einer Entnahme fuer eindeutig [ADR-043]', () => {
    const e = xirr([
      fluss('2024-01-01', '-1000'),
      fluss('2024-06-01', '200'),
      fluss('2024-09-01', '-1000'),
      fluss('2025-01-01', '2000'),
    ]);
    expect(e.art).toBe('ok');
    if (e.art === 'ok') expect(e.mehrdeutig).toBe(false);
  });

  it('haelt eine Verlustreihe mit genau einem Vorzeichenwechsel fuer eindeutig', () => {
    // Die kumulierte Summe wechselt hier nie — erst ab zwei Wechseln darf Norstrom entscheiden.
    const e = xirr([fluss('2024-01-01', '-1000'), fluss('2025-01-01', '500')]);
    expect(e.art).toBe('ok');
    if (e.art === 'ok') expect(e.mehrdeutig).toBe(false);
  });

  it('bleibt innerhalb der Grenzen, wenn es konvergiert', () => {
    const proben: Fluss[][] = [
      [fluss('2025-01-01', '-1000'), fluss('2026-01-01', '1'), fluss('2026-06-01', '1')],
      [fluss('2020-01-01', '-100'), fluss('2026-01-01', '900')],
      [fluss('2025-01-01', '-1'), fluss('2025-01-02', '2')],
      [fluss('2025-01-01', '-1000'), fluss('2025-01-01', '1000.01')],
    ];
    for (const probe of proben) {
      const e = xirr(probe);
      if (e.art === 'ok') {
        expect(Number.isNaN(e.rate)).toBe(false);
        expect(e.rate).toBeGreaterThan(UNTERGRENZE - 1e-9);
        expect(e.rate).toBeLessThanOrEqual(OBERGRENZE);
      }
    }
  });

  it('gibt niemals NaN zurueck', () => {
    const gemein: Fluss[][] = [
      [],
      [fluss('2025-01-01', '0'), fluss('2026-01-01', '0')],
      [fluss('2025-01-01', '-1000'), fluss('2025-01-01', '1000')],
      [fluss('2025-01-01', '-1000'), fluss('2025-01-01', '500'), fluss('2025-01-01', '600')],
    ];
    for (const probe of gemein) {
      const e = xirr(probe);
      if (e.art === 'ok') expect(Number.isNaN(e.rate)).toBe(false);
    }
  });

  it('haengt nicht von der Eingabereihenfolge ab', () => {
    const a = [fluss('2025-01-01', '-1000'), fluss('2025-06-01', '-500'), fluss('2026-01-01', '1700')];
    const b = [a[2]!, a[0]!, a[1]!];
    expect(rate(a)).toBeCloseTo(rate(b), 12);
  });

  it('bricht ab, statt mit einem nicht endlichen Zwischenwert weiterzurechnen', () => {
    // Ein astronomischer Betrag laesst Number(betrag) auf Infinity ueberlaufen —
    // Barwert und Ableitung werden zu NaN/Infinity, sowohl in Newton als auch,
    // nach dem Abbruch, in der ersten Pruefung der Bisektion.
    const riesig = `1${'0'.repeat(310)}`;
    const e = xirr([fluss('2025-01-01', `-${riesig}`), fluss('2026-01-01', riesig)]);
    expect(e.art).toBe('nicht_konvergiert');
  });

  it('erkennt eine Zahlungsreihe, die genau an der Obergrenze eine Nullstelle hat', () => {
    // Newton divergiert bei dieser Konstruktion, bevor die Bisektion beginnt — dort
    // trifft der erste Test von barwert(OBERGRENZE) exakt auf null, ohne jede weitere
    // Iteration. Die Betraege sind so gewaehlt (Vielfache von 11^4 bzw. 11^10), dass
    // die Division bei r = OBERGRENZE (Basis 11) exakt aufgeht.
    const e = xirr([
      fluss('2020-01-01', '0.01'),
      fluss('2023-12-31', '-292.82'),
      fluss('2029-12-29', '259374246.01'),
    ]);
    expect(e).toEqual({ art: 'ok', rate: OBERGRENZE, iterationen: 0, mehrdeutig: true });
  });

  it('erreicht die geforderte Genauigkeit', () => {
    const e = xirr([fluss('2025-01-01', '-1000'), fluss('2026-01-01', '1100')]);
    expect(e.art).toBe('ok');
    if (e.art === 'ok') {
      const barwert = -1000 + 1100 / Math.pow(1 + e.rate, 1);
      expect(Math.abs(barwert)).toBeLessThan(GENAUIGKEIT * 1000);
      expect(e.iterationen).toBeGreaterThan(0);
    }
  });
});

describe('renditeFluesse', () => {
  it('dreht das Vorzeichen der externen Fluesse und haengt den Endwert an', () => {
    const f = renditeFluesse([fluss('2025-01-01', '1000'), fluss('2025-06-01', '-200')], zuCent('900'), T('2026-01-01'));
    expect(f).toEqual([
      { tag: '2025-01-01', betrag: -zuCent('1000') },
      { tag: '2025-06-01', betrag: zuCent('200') },
      { tag: '2026-01-01', betrag: zuCent('900') },
    ]);
  });

  it('ergibt eine Rendite von null, wenn nichts passiert ist', () => {
    const f = renditeFluesse([fluss('2025-01-01', '1000')], zuCent('1000'), T('2026-01-01'));
    expect(rate(f)).toBeCloseTo(0, 9);
  });

  it('sortiert, auch wenn der Endwert vor dem letzten Fluss liegt', () => {
    const f = renditeFluesse([fluss('2026-06-01', '100')], zuCent('100'), T('2026-01-01'));
    expect(f.map((x) => x.tag)).toEqual(['2026-01-01', '2026-06-01']);
  });
});
