import { describe, expect, it } from 'vitest';
import { restAnteil, summeAnteile } from '../../core/anteile.ts';

describe('restAnteil', () => {
  it('gibt den Rest bis 1 zurueck', () => {
    expect(restAnteil([0.6, 0.3])).toBeCloseTo(0.1, 12);
  });

  it('ergibt 1 bei leeren Positionen', () => {
    expect(restAnteil([])).toBe(1);
  });

  it('klemmt auf 0, wenn die Anteile bereits 1 ausfuellen oder ueberschreiten', () => {
    expect(restAnteil([0.6, 0.4])).toBe(0);
    expect(restAnteil([0.7, 0.5])).toBe(0);
  });

  it('ignoriert NaN statt es durchzureichen', () => {
    expect(restAnteil([0.5, NaN])).toBeCloseTo(0.5, 12);
  });
});

describe('summeAnteile', () => {
  it('summiert die Anteile', () => {
    expect(summeAnteile([0.1, 0.2, 0.3])).toBeCloseTo(0.6, 12);
  });

  it('ergibt 0 bei leerer Liste', () => {
    expect(summeAnteile([])).toBe(0);
  });

  it('ignoriert NaN statt es durchzureichen', () => {
    expect(summeAnteile([0.2, NaN])).toBeCloseTo(0.2, 12);
  });
});
