/**
 * `npm start` holt einmal, wenn der letzte erfolgreiche Lauf mindestens 15 Minuten her ist;
 * `npm run dev` nur bei leerer Datenbank. [ADR-064]
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STARTLAUF_ABSTAND_MS, startlaufGrund } from '../../start/start.ts';

const JETZT = Date.parse('2026-11-12T10:00:00.000Z');
const vorMs = (ms: number) => new Date(JETZT - ms).toISOString();
const AN = { ingest: true, startlauf: true } as const;

describe('startlaufGrund [ADR-064]', () => {
  it('holt bei leerer Datenbank immer, auch unter dev', () => {
    const grund = startlaufGrund({
      schalter: { ingest: true, startlauf: false },
      leer: true,
      letzterErfolg: null,
      jetztMs: JETZT,
    });
    expect(grund).toBe('leer');
  });

  it('holt nie mit --ohne-ingest', () => {
    const grund = startlaufGrund({
      schalter: { ingest: false, startlauf: true },
      leer: true,
      letzterErfolg: null,
      jetztMs: JETZT,
    });
    expect(grund).toBeNull();
  });

  it('holt unter dev nicht, wenn Daten da sind', () => {
    const grund = startlaufGrund({
      schalter: { ingest: true, startlauf: false },
      leer: false,
      letzterErfolg: vorMs(3 * 86_400_000),
      jetztMs: JETZT,
    });
    expect(grund).toBeNull();
  });

  it('holt nicht, solange der letzte Erfolg keine 15 Minuten her ist', () => {
    const grund = startlaufGrund({
      schalter: AN,
      leer: false,
      letzterErfolg: vorMs(STARTLAUF_ABSTAND_MS - 1),
      jetztMs: JETZT,
    });
    expect(grund).toBeNull();
  });

  it('holt ab 15 Minuten', () => {
    const grund = startlaufGrund({
      schalter: AN,
      leer: false,
      letzterErfolg: vorMs(STARTLAUF_ABSTAND_MS),
      jetztMs: JETZT,
    });
    expect(grund).toBe('faellig');
  });

  it('holt, wenn es nur gescheiterte Läufe gibt', () => {
    expect(startlaufGrund({ schalter: AN, leer: false, letzterErfolg: null, jetztMs: JETZT })).toBe(
      'faellig',
    );
  });

  it('holt bei einem Zeitpunkt in der Zukunft oder einem unlesbaren — die Uhr war verstellt', () => {
    for (const letzterErfolg of [vorMs(-60_000), 'kaputt']) {
      expect(startlaufGrund({ schalter: AN, leer: false, letzterErfolg, jetztMs: JETZT })).toBe(
        'faellig',
      );
    }
  });
});

describe('npm run dev', () => {
  it('schaltet den Startlauf ab — sonst holte jedes Speichern', () => {
    expect(readFileSync(new URL('../../start/dev.ts', import.meta.url), 'utf8')).toContain(
      "'--ohne-startlauf'",
    );
  });
});
