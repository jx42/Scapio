/**
 * `entschaerfe()` gegen Formel-Injektion in Fremdtext. [INV-06]
 */

import { describe, expect, it } from 'vitest';
import { entschaerfe } from '../../ingest/fremdtext.ts';

describe('entschaerfe', () => {
  it('macht aus einer Formel Text', () => {
    expect(entschaerfe('=1+1')).toBe("'=1+1");
    expect(entschaerfe('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(entschaerfe('+49 170')).toBe("'+49 170");
  });

  it('laesst eine negative Zahl in Ruhe — ihr Minus ist ein Vorzeichen', () => {
    expect(entschaerfe('-0,25')).toBe('-0,25');
    expect(entschaerfe('-12.5%')).toBe('-12.5%');
  });

  it('laesst normalen Text unveraendert', () => {
    expect(entschaerfe('APPLE INC')).toBe('APPLE INC');
    expect(entschaerfe('')).toBe('');
  });
});
