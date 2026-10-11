/** Die Konsole von `npm run ingest` und `lauf.log` tragen keinen Fremdtext [ADR-042]. */

import { describe, expect, it } from 'vitest';
import { hinweis, hinweisKurz } from '../shared/hinweise.ts';

describe('hinweisKurz', () => {
  it('laesst den Wertpapiernamen beim Tagessprung weg, ISIN und Zahlen bleiben', () => {
    const kurz = hinweisKurz(
      hinweis('tagessprung', { isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World', anzahl: 2, von: '2026-01-02', bis: '2026-01-03' }),
    );
    expect(kurz).not.toContain('iShares');
    expect(kurz).toContain('IE00B4L5Y983');
    expect(kurz).toContain('"anzahl":2');
  });

  it('laesst den Altsatz einer frueheren Datenbankzeile weg', () => {
    expect(hinweisKurz(hinweis('text', { text: 'Bestand 1.234,56 €' }))).toBe('text {}');
  });
});
