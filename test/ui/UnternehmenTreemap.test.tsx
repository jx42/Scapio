// @vitest-environment jsdom
/*
 * Ein Feld der Treemap ohne Layout: Recharts misst in jsdom nichts, `FeldForm` bekommt deshalb
 * einen festen Knoten. Deckt Beschriftung und Deckkraft ab, vor allem für „Andere“.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { de } from '@/i18n/de';
import type { Gruppe } from '@/lib/api';
import { DECKKRAFT_GEDIMMT } from '@/lib/chartmasse';
import { anteilProzent, euroAusCent, zahl } from '@/lib/format';
import { FARBE } from '@/lib/farben';
import { ringFarbe } from '@/components/Ring';
import { FeldForm, andereFeld, unternehmenFeld, type Feld, type Knoten } from '@/features/aufteilung/analyse/UnternehmenTreemap';
import { unternehmenZeile } from './fixtures';

const SEKTOREN: Gruppe[] = [
  { name: 'Information Technology', exposureCent: 30, anteil: 0.5 },
  { name: null, exposureCent: 10, anteil: 0.2 },
];

const GROSS: Knoten = { depth: 1, index: 0, x: 0, y: 0, width: 400, height: 120 };

function feld(felder: readonly Feld[], aktiv = true, knoten = GROSS) {
  const { container } = render(
    <svg>
      <FeldForm knoten={knoten} felder={felder} aktiv={() => aktiv} />
    </svg>,
  );
  return container;
}

describe('andereFeld', () => {
  it('gibt es nur mit Rest im Depot', () => {
    expect(andereFeld(0, 0, 0, false)).toBeNull();
    expect(andereFeld(-1, 0, 0, false)).toBeNull();
    expect(andereFeld(100, 0.4, 3, false)?.art).toBe('andere');
  });
});

describe('unternehmenFeld', () => {
  it('nimmt Farbe und Schlüssel des Sektors, Unbekanntes fällt unter „Übrige“', () => {
    const technik = unternehmenFeld(unternehmenZeile(1, { sektor: 'Information Technology' }), SEKTOREN);
    expect(technik.farbe).toBe(ringFarbe(0));
    expect(technik.gruppe).toBe('Information Technology');
    const fremd = unternehmenFeld(unternehmenZeile(2, { sektor: 'Raumfahrt' }), SEKTOREN);
    expect(fremd.farbe).toBe(FARBE.rand);
    expect(fremd.gruppe).toBe('');
  });
});

describe('FeldForm', () => {
  const andere = andereFeld(20_000_000, 0.4, 1832, true);
  if (andere === null) throw new Error('Fixture');

  it('„Andere“: Name, Zahl der Unternehmen, Anteil und Exposure', () => {
    const zeilen = [...feld([andere]).querySelectorAll('tspan')].map((t) => t.textContent);
    expect(zeilen).toEqual([
      de.top25.andere,
      de.top25.andereAnzahl(zahl(1832), true),
      de.top25.andereWerte(anteilProzent(0.4), euroAusCent(20_000_000)),
    ]);
  });

  it('„Andere“ ohne Platz für die dritte Zeile: nur Name und Zahl', () => {
    expect(feld([andere], true, { ...GROSS, height: 40 }).querySelectorAll('tspan')).toHaveLength(2);
  });

  it('ein Unternehmen: Name und Anteil', () => {
    const z = unternehmenFeld(unternehmenZeile(1, { name: 'Apple Inc.', anteilDepot: 0.15 }), SEKTOREN);
    const zeilen = [...feld([z]).querySelectorAll('tspan')].map((t) => t.textContent);
    expect(zeilen).toEqual(['Apple Inc.', anteilProzent(0.15)]);
  });

  it('dimmt Fläche und Schrift, wenn das Feld nicht hervorgehoben ist', () => {
    const container = feld([andere], false);
    expect(container.querySelector('rect')).toHaveAttribute('fill-opacity', String(DECKKRAFT_GEDIMMT));
    expect(container.querySelector('text')).toHaveAttribute('fill-opacity', String(DECKKRAFT_GEDIMMT));
    expect(feld([andere], true).querySelector('rect')).toHaveAttribute('fill-opacity', '1');
  });
});
