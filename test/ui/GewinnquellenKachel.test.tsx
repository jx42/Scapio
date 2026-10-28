// @vitest-environment jsdom
/*
 * Kachel „Woher kommt der Gewinn“: eine Abfrage ohne Parameter. Fremdtext (Wertpapiername)
 * landet in Tabelle und Beschriftung als Text, nie als Markup. [INV-06]
 */

import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';

import { de } from '@/i18n/de';
import type { Gewinnquellen } from '@/lib/api';
import { GewinnquellenKachel } from '@/features/gewinnquellen/GewinnquellenKachel';
import { erwarteBarrierefrei, fetchErsatz, rendern, type Antwort } from './hilfen';
import { drift } from './fixtures';

const GEWINNQUELLEN: Gewinnquellen = {
  stand: '2026-08-26T12:08:00+02:00',
  drift: drift(),
  zufluesse: [
    { art: 'position', isin: 'IE00B4L5Y983', name: 'Welt <b>ETF</b>', anzahl: 1, betragCent: 900_00, anteil: 0.9 },
    { art: 'ertraege', isin: null, name: null, anzahl: 1, betragCent: 100_00, anteil: 0.1 },
  ],
  abfluesse: [
    { art: 'position', isin: 'US0378331005', name: 'Einzelaktie', anzahl: 1, betragCent: -200_00, anteil: 0.2 },
    { art: 'steuern', isin: null, name: null, anzahl: 1, betragCent: -50_00, anteil: 0.05 },
  ],
  bruttoCent: 1_000_00,
  abzuegeCent: -250_00,
  nettoCent: 750_00,
  mitteCent: 1_000_00,
  nettoAnteil: 0.75,
};

function abfrage(gewinnquellen: () => Antwort) {
  return (pfad: string) => {
    if (pfad.startsWith('/api/gewinnquellen')) return gewinnquellen();
    throw new Error(`unerwarteter Pfad im Test: ${pfad}`);
  };
}

let wiederherstellen: (() => void) | null = null;

afterEach(() => {
  wiederherstellen?.();
  wiederherstellen = null;
});

describe('GewinnquellenKachel', () => {
  it('rendert die Tabelle mit allen Herkünften, Fremdtext als Text', async () => {
    wiederherstellen = fetchErsatz(abfrage(() => ({ body: GEWINNQUELLEN })));
    const { container } = rendern(<GewinnquellenKachel />);

    const tabelle = await screen.findByRole('table', { name: de.gewinnquellen.tabelle });
    const t = within(tabelle);
    expect(t.getByText('Welt <b>ETF</b>')).toBeInTheDocument();
    expect(t.getByText('Einzelaktie')).toBeInTheDocument();
    expect(t.getByText(de.gewinnquellen.ertraege)).toBeInTheDocument();
    expect(t.getByText(de.gewinnquellen.steuern)).toBeInTheDocument();
    expect(t.getByText(de.gewinnquellen.nettogewinn)).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    await erwarteBarrierefrei(container);
  });

  it('nennt Brutto, Abzuege und Netto, Abzuege nur, wenn es welche gibt', async () => {
    wiederherstellen = fetchErsatz(
      abfrage(() => ({ body: { ...GEWINNQUELLEN, abfluesse: [], abzuegeCent: 0, nettoCent: 1_000_00, nettoAnteil: 1 } })),
    );
    rendern(<GewinnquellenKachel />);

    expect(await screen.findAllByText(de.gewinnquellen.brutto)).not.toHaveLength(0);
    expect(screen.getByText(de.gewinnquellen.netto)).toBeInTheDocument();
    expect(screen.queryByText(de.gewinnquellen.abzuege)).toBeNull();
  });

  it('zeigt das Skeleton, solange die Abfrage haengt', () => {
    wiederherstellen = fetchErsatz(abfrage(() => 'haengt'));
    const { container } = rendern(<GewinnquellenKachel />);

    expect(screen.getByText(de.zustand.laedt)).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('zeigt den Leerzustand ohne Gewinn und Verlust', async () => {
    wiederherstellen = fetchErsatz(
      abfrage(() => ({
        body: { ...GEWINNQUELLEN, zufluesse: [], abfluesse: [], bruttoCent: 0, abzuegeCent: 0, nettoCent: 0, mitteCent: 0, nettoAnteil: 0 },
      })),
    );
    rendern(<GewinnquellenKachel />);

    expect(await screen.findByText(de.gewinnquellen.leer)).toBeInTheDocument();
  });

  it('nennt bei einem Nettoverlust den Nettoverlust', async () => {
    wiederherstellen = fetchErsatz(
      abfrage(() => ({
        body: {
          ...GEWINNQUELLEN,
          abfluesse: [{ art: 'position', isin: 'US0378331005', name: 'Einzelaktie', anzahl: 1, betragCent: -1_500_00, anteil: 1 }],
          abzuegeCent: -1_500_00,
          nettoCent: -500_00,
          mitteCent: 1_500_00,
          nettoAnteil: 1 / 3,
        },
      })),
    );
    rendern(<GewinnquellenKachel />);

    const tabelle = await screen.findByRole('table', { name: de.gewinnquellen.tabelle });
    expect(within(tabelle).getByText(de.gewinnquellen.nettoverlust)).toBeInTheDocument();
  });

  it('zeigt den Fehlerzustand, wenn der Server ablehnt', async () => {
    wiederherstellen = fetchErsatz(
      abfrage(() => ({
        status: 500,
        body: { fehler: { code: 'E_DB', text: 'Die Datenbank ist nicht erreichbar.' } },
      })),
    );
    rendern(<GewinnquellenKachel />);

    expect(await screen.findByText(de.zustand.fehler)).toBeInTheDocument();
    expect(screen.getByText('Die Datenbank ist nicht erreichbar.')).toBeInTheDocument();
  });
});
