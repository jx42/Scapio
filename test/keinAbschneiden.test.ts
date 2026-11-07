/**
 * Text wird umbrochen, nie abgeschnitten: Was `truncate` mit Ellipse verschluckt, erreicht
 * nur, wer mit der Maus darauf zeigt — Tastatur, Touch und Lupe nicht (WCAG 1.4.10, 1.4.12).
 * Lange Namen bekommen `break-words`.
 */

import { describe, expect, it } from 'vitest';
import { alsListe, dateien, sucheImCode } from './invarianten/quellen.ts';

describe('kein abgeschnittener Text', () => {
  it('nutzt weder truncate noch text-ellipsis', () => {
    const treffer = sucheImCode(dateien(['src', 'test/edgecases'], ['.ts', '.tsx', '.css']), /\b(truncate|text-ellipsis)\b/);
    expect(treffer, `abgeschnitten statt umbrochen:\n${alsListe(treffer)}`).toEqual([]);
  });
});
