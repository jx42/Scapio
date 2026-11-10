/*
 * Die zeitgetreue Achse des Positionsverlaufs: Abstand nach Kalendertagen, auch bei gemischter
 * Aufloesung der Reihe, und nie eine Beschriftung, die rechts aus dem Chart liefe.
 */

import { describe, expect, it } from 'vitest';

import { tagAchsenwert, zeitachse } from '@/lib/format';

const alsTag = (x: number) => new Date(x * 86_400_000).toISOString().slice(0, 10);

describe('tagAchsenwert', () => {
  it('ist proportional zu Kalendertagen, Monatsende gegen Tageszeile', () => {
    expect(tagAchsenwert('2025-01-31') - tagAchsenwert('2024-12-31')).toBe(31);
    expect(tagAchsenwert('2025-02-28') - tagAchsenwert('2025-01-31')).toBe(28);
    expect(tagAchsenwert('2026-11-08') - tagAchsenwert('2026-11-07')).toBe(1);
  });

  it('kennt die Zeitumstellung nicht', () => {
    expect(tagAchsenwert('2025-03-31') - tagAchsenwert('2025-03-30')).toBe(1);
    expect(tagAchsenwert('2025-10-27') - tagAchsenwert('2025-10-26')).toBe(1);
  });
});

describe('zeitachse', () => {
  it('setzt kurze Fenster auf Montage und beschriftet Tag und Monat', () => {
    const { ticks, format } = zeitachse('2026-09-01', '2026-10-31');
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.length).toBeLessThanOrEqual(6);
    for (const tick of ticks) expect(new Date(tick * 86_400_000).getUTCDay()).toBe(1);
    expect(format(tagAchsenwert('2026-09-07'))).toBe('07.09.');
  });

  it('setzt lange Fenster auf Monatserste', () => {
    const { ticks, format } = zeitachse('2025-11-08', '2026-11-08');
    expect(ticks.length).toBeLessThanOrEqual(6);
    for (const tick of ticks) expect(alsTag(tick).endsWith('-01')).toBe(true);
    expect(format(tagAchsenwert('2026-03-01'))).toBe('03/26');
  });

  it('beschriftet auch bei Jahresschritten Monat und Jahr wie die Verlauf-Kachel', () => {
    const { ticks, format } = zeitachse('2018-01-15', '2026-11-08');
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.length).toBeLessThanOrEqual(6);
    for (const tick of ticks) expect(alsTag(tick).endsWith('-01-01')).toBe(true);
    expect(format(tagAchsenwert('2024-01-01'))).toBe('01/24');
  });

  it('laesst den rechten Rand frei', () => {
    const von = tagAchsenwert('2024-01-15');
    const bis = tagAchsenwert('2026-11-02');
    const { ticks } = zeitachse('2024-01-15', '2026-11-02');
    for (const tick of ticks) expect(tick).toBeLessThanOrEqual(bis - (bis - von) * 0.07);
  });

  it('kommt mit einem einzigen Tag zurecht', () => {
    expect(() => zeitachse('2026-11-02', '2026-11-02')).not.toThrow();
  });
});
