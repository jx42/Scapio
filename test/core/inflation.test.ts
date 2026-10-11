import { describe, expect, it } from 'vitest';
import { zuCent } from '../../core/dezimal.ts';
import { deflationiere, realeRendite, teuerungLaufendesJahr, teuerungProJahr } from '../../core/inflation.ts';
import type { Vpi } from '../../core/inflation.ts';
import { xirr } from '../../core/xirr.ts';
import { T, fluss } from '../hilfen.ts';

const vpi: Vpi = new Map([
  ['2024-01', 100],
  ['2025-01', 105],
  ['2026-01', 110.25],
  ['2026-08', 112],
]);

describe('deflationiere', () => {
  it('rechnet jeden Fluss auf die Kaufkraft des Basismonats hoch', () => {
    const { fluesse } = deflationiere([fluss('2024-01-15', '-1000')], vpi, '2026-01');
    // 1000 EUR von 2024 entsprechen 1102,50 EUR von 2026.
    expect(fluesse[0]!.betrag).toBe(zuCent('-1102.50'));
  });

  it('laesst einen Fluss aus dem Basismonat unveraendert', () => {
    const { fluesse } = deflationiere([fluss('2026-01-15', '-1000')], vpi, '2026-01');
    expect(fluesse[0]!.betrag).toBe(zuCent('-1000'));
  });

  it('schreibt einen fehlenden Monat fort und sagt es', () => {
    const { fluesse, fortgeschriebeneMonate } = deflationiere([fluss('2025-06-15', '-1000')], vpi, '2026-01');
    // Juni 2025 fehlt: der letzte bekannte Index (Januar 2025) gilt weiter.
    expect(fluesse[0]!.betrag).toBe(zuCent('-1050'));
    expect(fortgeschriebeneMonate).toEqual(['2025-06']);
  });

  it('nennt jeden fortgeschriebenen Monat nur einmal, sortiert', () => {
    const { fortgeschriebeneMonate } = deflationiere(
      [fluss('2025-07-15', '-100'), fluss('2025-06-15', '-100'), fluss('2025-06-20', '-100')],
      vpi,
      '2026-01',
    );
    expect(fortgeschriebeneMonate).toEqual(['2025-06', '2025-07']);
  });

  it('greift auf den aeltesten Index zurueck, wenn ein Fluss aelter ist als die Statistik', () => {
    const { fluesse, fortgeschriebeneMonate } = deflationiere([fluss('2020-01-15', '-1000')], vpi, '2026-01');
    expect(fluesse[0]!.betrag).toBe(zuCent('-1102.50'));
    expect(fortgeschriebeneMonate).toContain('2020-01');
  });

  it('laesst die Fluesse unveraendert, wenn es keinen Index gibt', () => {
    const { fluesse } = deflationiere([fluss('2024-01-15', '-1000')], new Map(), '2026-01');
    expect(fluesse[0]!.betrag).toBe(zuCent('-1000'));
  });

  it('rundet einmal, nicht pro Zwischenschritt', () => {
    const { fluesse } = deflationiere([fluss('2024-01-15', '-3.33')], vpi, '2026-01');
    expect(fluesse[0]!.betrag).toBe(zuCent('-3.67'));
  });

  it('laesst einen einzelnen Fluss unveraendert, wenn sein Monatsindex null ist', () => {
    // Der Basismonat hat einen echten Index, der Monat des Flusses selbst steht
    // aber mit 0 in der Statistik (z.B. ein Platzhalter) — hochrechnen waere hier
    // eine Division durch nichts, also bleibt der Fluss unangetastet.
    const vpiMitNull: Vpi = new Map([['2024-01', 0], ['2026-01', 105]]);
    const { fluesse } = deflationiere([fluss('2024-01-15', '-1000')], vpiMitNull, '2026-01');
    expect(fluesse[0]!.betrag).toBe(zuCent('-1000'));
  });
});

describe('teuerungProJahr', () => {
  it('annualisiert zwischen erstem Fluss und Basismonat', () => {
    expect(teuerungProJahr([fluss('2024-01-15', '-1000')], vpi, '2026-01')).toBeCloseTo(0.05, 9);
  });

  it('sagt nichts, wenn kein Zeitraum vergangen ist', () => {
    expect(teuerungProJahr([fluss('2026-01-15', '-1000')], vpi, '2026-01')).toBeNull();
  });

  it('sagt nichts ohne Fluesse und nichts ohne Index', () => {
    expect(teuerungProJahr([], vpi, '2026-01')).toBeNull();
    expect(teuerungProJahr([fluss('2024-01-15', '-1000')], new Map(), '2026-01')).toBeNull();
  });

  it('nimmt den fruehesten Fluss, nicht den ersten der Liste', () => {
    const spaetZuerst = [fluss('2026-01-15', '100'), fluss('2024-01-15', '-1000')];
    expect(teuerungProJahr(spaetZuerst, vpi, '2026-01')).toBeCloseTo(0.05, 9);
  });

  it('endet am letzten echten Monat, statt das laufende Jahr mit Nullinflation fortzuschreiben', () => {
    const ohneAktuellesJahr: Vpi = new Map([['2024-01', 100], ['2025-01', 105]]);
    // Basismonat '2026-01' hat keine echte Zahl; der Durchschnitt bleibt bei den
    // vollen 5 % zwischen 2024-01 und 2025-01, statt ueber zwei Jahre verduennt zu werden.
    expect(teuerungProJahr([fluss('2024-01-15', '-1000')], ohneAktuellesJahr, '2026-01')).toBeCloseTo(0.05, 9);
  });

  it('zaehlt die Jahre erst ab dem aeltesten VPI-Monat, wenn die Reihe nach dem ersten Fluss beginnt [ADR-043]', () => {
    // Fluss 2022, Reihe ab 2024: zwei Jahre zu 5 %, nicht vier Jahre zu 2,5 %.
    expect(teuerungProJahr([fluss('2022-01-15', '-1000')], vpi, '2026-01')).toBeCloseTo(0.05, 9);
  });
});

describe('teuerungLaufendesJahr', () => {
  /** Zwei volle Jahre, damit jeder Monat des laufenden einen Vorjahresmonat hat. */
  const reihe: Vpi = new Map([
    ['2025-01', 100],
    ['2025-02', 100],
    ['2025-03', 100],
    ['2026-01', 102],
    ['2026-02', 104],
    ['2026-03', 103],
  ]);

  it('mittelt die Veraenderungen zum jeweiligen Vorjahresmonat', () => {
    // 2 %, 4 %, 3 % → 3 %.
    expect(teuerungLaufendesJahr(reihe, '2026-03')).toBeCloseTo(0.03, 10);
  });

  it('zaehlt nur die Monate bis zum Basismonat', () => {
    expect(teuerungLaufendesJahr(reihe, '2026-02')).toBeCloseTo(0.03, 10);
  });

  it('laesst einen Monat ohne Vorjahresmonat weg, statt ihn gegen nichts zu rechnen', () => {
    const luecke: Vpi = new Map([...reihe, ['2026-04', 110]]);
    // April 2025 fehlt — April 2026 zaehlt nicht mit, das Mittel bleibt bei 3 %.
    expect(teuerungLaufendesJahr(luecke, '2026-04')).toBeCloseTo(0.03, 10);
  });

  it('ist null, solange das laufende Jahr keinen einzigen Monat hat', () => {
    expect(teuerungLaufendesJahr(reihe, '2027-05')).toBeNull();
    expect(teuerungLaufendesJahr(new Map(), '2026-03')).toBeNull();
  });

  it('nimmt den Vorjahresmonat und nicht den Dezember davor — sonst misst es den Jahresrhythmus mit', () => {
    // Preise steigen jedes Jahr gleich, aber der Winter ist teurer als der Sommer.
    const saison: Vpi = new Map([
      ['2025-01', 110],
      ['2025-07', 100],
      ['2025-12', 110],
      ['2026-01', 112.2],
      ['2026-07', 102],
    ]);
    // Beide Monate liegen 2 % ueber ihrem Vorjahresmonat — trotz des Sturzes von 110 auf 102.
    expect(teuerungLaufendesJahr(saison, '2026-07')).toBeCloseTo(0.02, 10);
  });
});

describe('realeRendite', () => {
  it('liegt unter der nominalen, wenn die Preise gestiegen sind', () => {
    const fluesse = [fluss('2024-01-15', '-1000'), fluss('2026-01-15', '1200')];
    const nominal = xirr(fluesse);
    const real = realeRendite(fluesse, vpi, T('2026-01-31'), nominal);

    expect(nominal.art).toBe('ok');
    expect(real.exakt.art).toBe('ok');
    if (nominal.art === 'ok' && real.exakt.art === 'ok') {
      expect(real.exakt.rate).toBeLessThan(nominal.rate);
    }
  });

  it('nennt die Fisher-Naeherung daneben, ohne sie zu verwechseln', () => {
    const fluesse = [fluss('2024-01-15', '-1000'), fluss('2026-01-15', '1200')];
    const nominal = xirr(fluesse);
    const real = realeRendite(fluesse, vpi, T('2026-01-31'), nominal);

    expect(real.teuerungProJahr).toBeCloseTo(0.05, 9);
    if (nominal.art === 'ok' && real.exakt.art === 'ok') {
      expect(real.fisher).toBeCloseTo((1 + nominal.rate) / 1.05 - 1, 9);
      // Naeherung und exakte Rechnung liegen nah beieinander, sind aber nicht dasselbe.
      expect(real.fisher).not.toBe(real.exakt.rate);
      expect(Math.abs(real.fisher! - real.exakt.rate)).toBeLessThan(0.01);
    }
  });

  it('nennt den Basismonat, auf den gerechnet wurde', () => {
    const real = realeRendite([fluss('2024-01-15', '-1000')], vpi, T('2026-08-26'));
    expect(real.basisMonat).toBe('2026-08');
  });

  it('nennt den letzten echten Monat, wenn das laufende Jahr noch keine Zahl hat', () => {
    const ohneAktuellesJahr: Vpi = new Map([['2024-01', 100], ['2025-01', 105]]);
    const real = realeRendite([fluss('2024-01-15', '-1000')], ohneAktuellesJahr, T('2026-08-26'));
    expect(real.basisMonat).toBe('2026-08');
    expect(real.teuerungBisMonat).toBe('2025-01');
  });

  it('sagt ohne Index klar, dass es nichts sagen kann', () => {
    const real = realeRendite([fluss('2024-01-15', '-1000'), fluss('2026-01-15', '1200')], new Map(), T('2026-01-31'));
    expect(real.exakt).toEqual({ art: 'zu_wenige_fluesse' });
    expect(real.fisher).toBeNull();
    expect(real.teuerungProJahr).toBeNull();
    expect(real.teuerungBisMonat).toBeNull();
    expect(real.fortgeschriebeneMonate).toEqual([]);
  });

  it('laesst die Fisher-Naeherung weg, wenn der nominale XIRR fehlt', () => {
    const real = realeRendite([fluss('2024-01-15', '-1000'), fluss('2026-01-15', '1200')], vpi, T('2026-01-31'));
    expect(real.fisher).toBeNull();
    expect(real.exakt.art).toBe('ok');
  });

  it('laesst die reale Rendite bei stabilen Preisen der nominalen gleichen', () => {
    const flach: Vpi = new Map([['2024-01', 100], ['2026-01', 100]]);
    const fluesse = [fluss('2024-01-15', '-1000'), fluss('2026-01-15', '1200')];
    const nominal = xirr(fluesse);
    const real = realeRendite(fluesse, flach, T('2026-01-31'), nominal);
    if (nominal.art === 'ok' && real.exakt.art === 'ok') {
      expect(real.exakt.rate).toBeCloseTo(nominal.rate, 9);
    }
  });
});
