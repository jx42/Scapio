/** `verify --nur-zaehlung` nennt Tag und Feld, nie einen Betrag [ADR-042]. */

import { describe, expect, it } from 'vitest';
import type { Cent } from '../../core/dezimal.ts';
import type { Tag } from '../../core/kalender.ts';
import { vergleicheReihen, zaehlungText } from '../../start/verify.ts';

const zeile = (tag: string, gesamt: bigint) => ({
  tag: tag as Tag,
  wertpapiereCent: gesamt as Cent,
  cashCent: 0n as Cent,
  gesamtCent: gesamt as Cent,
  nettoEinzahlungKumCent: 4_200_00n as Cent,
});

describe('zaehlungText', () => {
  it('zaehlt je Feld und nennt Tage, ohne einen Betrag', () => {
    const befunde = vergleicheReihen([zeile('2026-01-02', 1_234_567n)], [zeile('2026-01-02', 1_234_999n)]);
    const text = zaehlungText(befunde);

    expect(text).toContain('2 Abweichung(en)');
    expect(text).toContain('2026-01-02  gesamtCent');
    expect(text).not.toMatch(/12\.?345|4\.?200|1\.?234|\d+,\d\d/);
  });
});
