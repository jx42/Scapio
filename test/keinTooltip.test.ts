/**
 * Erklaerungen stehen im Popover, nie im Tooltip: ein Tooltip oeffnet auf Touchgeraeten
 * nicht und verschwindet beim Zeigen darauf (WCAG 1.4.13). `ui/tooltip.tsx` ist deshalb
 * geloescht; dieser Test haelt auch den Radix-Primitive draussen — und `title=`, den
 * Tooltip des Browsers, den weder Tastatur noch Touch verlaesslich erreichen.
 */

import { describe, expect, it } from 'vitest';
import { alsListe, dateien, sucheImCode } from './invarianten/quellen.ts';

/** Wo `title=` stehen darf, und warum es dort nichts Eigenes erklaert. */
const TITEL_AUSNAHMEN: Readonly<Record<string, string>> = {
  'src/components/OnvistaLink.tsx': 'Zusatz zum Link, dessen Ziel schon aria-label und sichtbarer Text nennen',
  'test/edgecases/main.tsx': 'Name des iframe, kein Hinweistext',
  'test/edgecases/elemente.tsx': 'Name des iframe, kein Hinweistext',
};

describe('kein Tooltip in der Oberflaeche', () => {
  it('importiert weder ui/tooltip noch den Radix-Tooltip', () => {
    const treffer = sucheImCode(
      dateien(['src', 'test/edgecases']),
      /components\/ui\/tooltip|\bTooltip(Primitive)?\b.*from 'radix-ui'|from '@radix-ui\/react-tooltip'/,
    );
    expect(treffer, `Tooltip statt Popover:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('setzt kein title-Attribut, ausser an den begruendeten Stellen', () => {
    const treffer = sucheImCode(dateien(['src', 'test/edgecases'], ['.tsx']), /\btitle=/).filter(
      (t) => !(t.pfad in TITEL_AUSNAHMEN),
    );
    expect(treffer, `title= statt InfoKnopf oder Fussnote:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('jede Ausnahme gibt es noch', () => {
    const mitTitel = new Set(sucheImCode(dateien(Object.keys(TITEL_AUSNAHMEN)), /\btitle=/).map((t) => t.pfad));
    expect(Object.keys(TITEL_AUSNAHMEN).filter((p) => !mitTitel.has(p))).toEqual([]);
  });
});
