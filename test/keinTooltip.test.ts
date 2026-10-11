/**
 * Erklaerungen stehen im Popover, nie im Tooltip: ein Tooltip oeffnet auf Touchgeraeten
 * nicht und verschwindet beim Zeigen darauf (WCAG 1.4.13). `ui/tooltip.tsx` ist deshalb
 * geloescht; dieser Test haelt auch den Radix-Primitive draussen.
 */

import { describe, expect, it } from 'vitest';
import { alsListe, dateien, sucheImCode } from './invarianten/quellen.ts';

describe('kein Tooltip in der Oberflaeche', () => {
  it('importiert weder ui/tooltip noch den Radix-Tooltip', () => {
    const treffer = sucheImCode(
      dateien(['src', 'test/edgecases']),
      /components\/ui\/tooltip|\bTooltip(Primitive)?\b.*from 'radix-ui'|from '@radix-ui\/react-tooltip'/,
    );
    expect(treffer, `Tooltip statt Popover:\n${alsListe(treffer)}`).toEqual([]);
  });
});
