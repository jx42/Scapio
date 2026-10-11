// @vitest-environment jsdom
/*
 * Kachel 6: eine Abfrage (sparplaene), eigener Zustand — sie faellt unabhaengig von den
 * Fluessen aus. Derselbe Sechser-Satz.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { de } from '@/i18n/de';
import type { Sparplaene } from '@/lib/api';
import { SparplaeneKachel } from '@/features/sparplaene/SparplaeneKachel';
import { erwarteBarrierefrei, euro, fetchErsatz, rendern, type Antwort } from './hilfen';
import { drift } from './fixtures';

const SPARPLAENE: Sparplaene = {
  stand: '2026-08-26T12:08:00+02:00',
  drift: drift(),
  plaene: [
    {
      isin: 'IE00B4L5Y983',
      name: 'iShares Core MSCI World',
      betragCent: 50_000,
      frequenz: 'MONTHLY',
      tagImMonat: 15,
      naechste: '2026-09-15',
    },
  ],
  summeCent: 50_000,
};

function planAbfrage(sparplaene: () => Antwort) {
  return (pfad: string) => {
    if (pfad === '/api/sparplaene') return sparplaene();
    throw new Error(`unerwarteter Pfad im Test: ${pfad}`);
  };
}

let wiederherstellen: (() => void) | null = null;

afterEach(() => {
  wiederherstellen?.();
  wiederherstellen = null;
});

describe('SparplaeneKachel', () => {
  it('rendert mit Fixture-Daten: Plan, Rhythmus und Summe im deutschen Format', async () => {
    wiederherstellen = fetchErsatz(planAbfrage(() => ({ body: SPARPLAENE })));
    rendern(<SparplaeneKachel />);

    await screen.findByRole('table', { name: de.sparplaene.tabelle });
    expect(screen.getByRole('region', { name: de.sparplaene.titel })).toBeInTheDocument();
    expect(screen.getByText('iShares Core MSCI World')).toBeInTheDocument();
    expect(screen.getByText('monatlich, am 15.')).toBeInTheDocument();
    expect(screen.getAllByText(euro(50_000))).toHaveLength(2);
  });

  it('zeigt das Skeleton, solange die Abfrage haengt', () => {
    wiederherstellen = fetchErsatz(planAbfrage(() => 'haengt'));
    const { container } = rendern(<SparplaeneKachel />);

    expect(screen.getByText(de.zustand.laedt)).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('zeigt den Leerzustand, wenn kein Sparplan aktiv ist', async () => {
    wiederherstellen = fetchErsatz(
      planAbfrage(() => ({ body: { ...SPARPLAENE, plaene: [], summeCent: 0 } })),
    );
    rendern(<SparplaeneKachel />);

    expect(await screen.findByText(de.sparplaene.leer)).toBeInTheDocument();
  });

  it('zeigt den Fehlerzustand, ohne die Anwendung zu reissen, wenn der Server ablehnt', async () => {
    wiederherstellen = fetchErsatz(
      planAbfrage(() => ({
        status: 500,
        body: { fehler: { code: 'E_DB', text: 'Die Datenbank ist nicht erreichbar.' } },
      })),
    );
    rendern(<SparplaeneKachel />);

    expect(await screen.findByText(de.zustand.fehler)).toBeInTheDocument();
    expect(screen.getByText('Die Datenbank ist nicht erreichbar.')).toBeInTheDocument();
  });

  it('besteht axe ohne Verstoss', async () => {
    wiederherstellen = fetchErsatz(planAbfrage(() => ({ body: SPARPLAENE })));
    const { container } = rendern(<SparplaeneKachel />);
    await screen.findByRole('table', { name: de.sparplaene.tabelle });
    await erwarteBarrierefrei(container);
  });
});
