// @vitest-environment jsdom
/*
 * Kachel 2 ohne Look-Through: zwei Abfragen (Aufteilung traegt, Kennzahlen liefert nur die
 * Ringmitte), eine Auswahl (Hervorheben). Derselbe Sechser-Satz wie ueberall in test/ui/;
 * die Reiter in AufteilungReiter.test.tsx.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import type { Aufteilung } from '@/lib/api';
import { AufteilungKachel } from '@/features/aufteilung/AufteilungKachel';
import { erwarteBarrierefrei, euro, fetchErsatz, fokussieren, rendern, type Antwort } from './hilfen';
import { drift, health, kennzahlenAntwort, maxDrawdownOhne, realFixture, sharpeOhne, volatilitaetOhne, xirrOhne, xirrOk } from './fixtures';

const AUFTEILUNG: Aufteilung = {
  stand: '2026-08-26T12:08:00+02:00',
  drift: drift(),
  cashCent: 1_250_000,
  cashAnteil: 0.077,
  positionen: [
    {
      isin: 'IE00B4L5Y983',
      name: 'iShares Core MSCI World',
      art: 'ETF',
      wertCent: 28_500_000,
      anteil: 0.72,
      investiertCent: 20_000_000,
      gewinnCent: 8_500_000,
      gewinnProzent: 0.425,
      realisiertCent: 0,
      xirr: xirrOk(0.091),
    },
    {
      isin: 'IE00BKM4GZ66',
      name: 'iShares Core MSCI EM IMI',
      art: null,
      wertCent: 8_055_537,
      anteil: 0.203,
      investiertCent: 8_759_296,
      gewinnCent: -703_759,
      gewinnProzent: -0.0803,
      realisiertCent: 0,
      xirr: xirrOhne('nicht_konvergiert'),
    },
  ],
};

const KENNZAHLEN_MINIMAL = kennzahlenAntwort({
  zinsenCent: 0,
  steuernCent: 0,
  inflation: null,
  real: realFixture(xirrOhne('zu_wenige_fluesse')),
  sparrateCent: 0,
  sparrate12Cent: 0,
  maxDrawdown: maxDrawdownOhne('zu_wenig_daten'),
  volatilitaetProJahr: volatilitaetOhne('zu_wenig_daten'),
  sharpe: sharpeOhne('zu_wenig_daten'),
});

function planZweiAbfragen(aufteilung: () => Antwort) {
  return (pfad: string) => {
    if (pfad === '/api/aufteilung') return aufteilung();
    if (pfad === '/api/kennzahlen') return { body: KENNZAHLEN_MINIMAL };
    if (pfad === '/api/health') return { body: health(false) };
    throw new Error(`unerwarteter Pfad im Test: ${pfad}`);
  };
}

let wiederherstellen: (() => void) | null = null;

afterEach(() => {
  wiederherstellen?.();
  wiederherstellen = null;
});

describe('AufteilungKachel', () => {
  it('rendert mit Fixture-Daten: Positionen, Cash und deutsches Format', async () => {
    wiederherstellen = fetchErsatz(planZweiAbfragen(() => ({ body: AUFTEILUNG })));
    rendern(<AufteilungKachel />);

    await screen.findByText(de.aufteilung.tabelle);
    const legende = within(screen.getByRole('list'));
    expect(legende.getByText('iShares Core MSCI World')).toBeInTheDocument();
    expect(legende.getByText('iShares Core MSCI EM IMI')).toBeInTheDocument();
    expect(legende.getByText(de.aufteilung.cash)).toBeInTheDocument();
    expect(legende.getByText(euro(AUFTEILUNG.positionen[0]!.wertCent))).toBeInTheDocument();
    expect(legende.getByText(euro(AUFTEILUNG.cashCent))).toBeInTheDocument();
  });

  it('zeigt das Skeleton, solange die Abfrage haengt', () => {
    wiederherstellen = fetchErsatz(planZweiAbfragen(() => 'haengt'));
    const { container } = rendern(<AufteilungKachel />);

    expect(screen.getByText(de.zustand.laedt)).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('zeigt den Leerzustand, wenn weder Positionen noch Cash vorhanden sind', async () => {
    wiederherstellen = fetchErsatz(
      planZweiAbfragen(() => ({
        body: { ...AUFTEILUNG, positionen: [], cashCent: 0 },
      })),
    );
    rendern(<AufteilungKachel />);

    expect(await screen.findByText(de.aufteilung.leer)).toBeInTheDocument();
  });

  it('überzogenes Verrechnungskonto: Cash bleibt in Legende und Tabelle', async () => {
    wiederherstellen = fetchErsatz(planZweiAbfragen(() => ({ body: { ...AUFTEILUNG, cashCent: -50_000, cashAnteil: -0.001 } })));
    rendern(<AufteilungKachel />);

    const legende = within(await screen.findByRole('list'));
    expect(legende.getByText(de.aufteilung.cash)).toBeInTheDocument();
    expect(legende.getByText(euro(-50_000))).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: de.aufteilung.cash })).toBeInTheDocument();
  });

  it('steht trotzdem, wenn nur die Kennzahlen-Nebenabfrage scheitert', async () => {
    wiederherstellen = fetchErsatz((pfad) => {
      if (pfad === '/api/aufteilung') return { body: AUFTEILUNG };
      if (pfad === '/api/kennzahlen')
        return {
          status: 500,
          body: { fehler: { code: 'E_DB', text: 'kaputt' } },
        };
      if (pfad === '/api/health') return { body: health(false) };
      throw new Error(`unerwarteter Pfad im Test: ${pfad}`);
    });
    rendern(<AufteilungKachel />);

    const legende = within(await screen.findByRole('list'));
    expect(legende.getByText('iShares Core MSCI World')).toBeInTheDocument();
    expect(screen.queryByText(de.zustand.fehler)).not.toBeInTheDocument();
    expect(screen.queryByText(de.zustand.abgestuerzt)).not.toBeInTheDocument();
  });

  it('macht die Legendenzeilen mit der Tastatur bedienbar und hebt sie hervor', async () => {
    wiederherstellen = fetchErsatz(planZweiAbfragen(() => ({ body: AUFTEILUNG })));
    rendern(<AufteilungKachel />);
    await screen.findByText(de.aufteilung.tabelle);

    const knopf = screen.getByRole('button', {
      name: /^iShares Core MSCI World /,
    });
    expect(knopf).toHaveAttribute('aria-pressed', 'false');

    fokussieren(knopf);
    expect(knopf).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(knopf).toHaveAttribute('aria-pressed', 'true');
  });

  it('hebt die gehoverte ETF-Zeile hervor', async () => {
    wiederherstellen = fetchErsatz(planZweiAbfragen(() => ({ body: AUFTEILUNG })));
    rendern(<AufteilungKachel />);
    await screen.findByText(de.aufteilung.tabelle);

    const ersteZeile = screen.getByRole('button', {
      name: /^iShares Core MSCI World /,
    });
    const zweiteZeile = screen.getByRole('button', {
      name: /^iShares Core MSCI EM IMI /,
    });

    // Die Hover-Fläche liegt an der Listenzeile (`zeile-hover`), nicht am Knopf.
    await userEvent.hover(ersteZeile);
    expect(ersteZeile.closest('li')).toHaveAttribute('data-aktiv');
    expect(zweiteZeile.closest('li')).not.toHaveAttribute('data-aktiv');

    await userEvent.unhover(ersteZeile);
    expect(ersteZeile.closest('li')).not.toHaveAttribute('data-aktiv');
  });

  it('verlinkt jeden Positionsnamen zu seiner ISIN bei onvista, Cash nicht', async () => {
    wiederherstellen = fetchErsatz(planZweiAbfragen(() => ({ body: AUFTEILUNG })));
    rendern(<AufteilungKachel />);
    await screen.findByText(de.aufteilung.tabelle);

    const linkErsterEtf = screen.getByRole('link', {
      name: de.aufteilung.onvistaOeffnen('iShares Core MSCI World'),
    });
    expect(linkErsterEtf).toHaveAttribute('href', 'https://www.onvista.de/suche?searchValue=IE00B4L5Y983');
    expect(linkErsterEtf).toHaveAttribute('target', '_blank');
    expect(linkErsterEtf).toHaveAttribute('rel', 'noopener noreferrer');
    // Der Name ist der Link; eine eigene onvista-Spalte gibt es nicht mehr.
    expect(linkErsterEtf).toHaveTextContent('iShares Core MSCI World');
    expect(screen.queryByText('onvista')).not.toBeInTheDocument();

    expect(
      screen.queryByRole('link', {
        name: de.aufteilung.onvistaOeffnen(de.aufteilung.cash),
      }),
    ).not.toBeInTheDocument();
  });

  it('zeigt den Gewinn je Position mit Pfeil, Cash ohne Gewinn', async () => {
    wiederherstellen = fetchErsatz(planZweiAbfragen(() => ({ body: AUFTEILUNG })));
    rendern(<AufteilungKachel />);
    await screen.findByText(de.aufteilung.tabelle);

    const zeile = (name: string) => within(screen.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).closest('li')!);
    expect(zeile('iShares Core MSCI World').getByRole('img', { name: de.kennzahlen.richtungPositiv })).toBeInTheDocument();
    expect(zeile('iShares Core MSCI EM IMI').getByRole('img', { name: de.kennzahlen.richtungNegativ })).toBeInTheDocument();
    expect(zeile(de.aufteilung.cash).queryByRole('img')).not.toBeInTheDocument();

    const tabelle = screen.getByRole('table', { name: de.aufteilung.tabelle });
    expect(within(tabelle).getByRole('columnheader', { name: de.aufteilung.spalteGewinn })).toBeInTheDocument();
  });

  it('zeigt die Art je Position', async () => {
    const [etf, zweite] = AUFTEILUNG.positionen;
    const mitAktie: Aufteilung = {
      ...AUFTEILUNG,
      positionen: [
        etf!,
        {
          ...zweite!,
          isin: 'US67066G1040',
          name: 'NVIDIA Corp.',
          art: 'STOCK',
        },
      ],
    };
    wiederherstellen = fetchErsatz(planZweiAbfragen(() => ({ body: mitAktie })));
    rendern(<AufteilungKachel />);
    await screen.findByText(de.aufteilung.tabelle);

    const legende = within(screen.getByRole('list'));
    expect(legende.getByText(de.aufteilung.art('ETF'))).toBeInTheDocument();
    expect(legende.getByText(de.aufteilung.art('STOCK'))).toBeInTheDocument();
  });

  it('verlinkt Fonds wie jede andere Art ueber die ISIN-Suche', async () => {
    const [etf, zweite] = AUFTEILUNG.positionen;
    const mitFonds: Aufteilung = {
      ...AUFTEILUNG,
      positionen: [
        etf!,
        {
          ...zweite!,
          isin: 'LU0171310443',
          name: 'BGF World Technology Fund',
          art: 'FUND',
        },
      ],
    };
    wiederherstellen = fetchErsatz(planZweiAbfragen(() => ({ body: mitFonds })));
    rendern(<AufteilungKachel />);
    await screen.findByText(de.aufteilung.tabelle);

    expect(
      screen.getByRole('link', { name: de.aufteilung.onvistaOeffnen('BGF World Technology Fund') }),
    ).toHaveAttribute('href', 'https://www.onvista.de/suche?searchValue=LU0171310443');
  });

  it('besteht axe ohne Verstoss, sobald der Ring steht', async () => {
    wiederherstellen = fetchErsatz(planZweiAbfragen(() => ({ body: AUFTEILUNG })));
    const { container } = rendern(<AufteilungKachel />);
    await screen.findByText(de.aufteilung.tabelle);
    await erwarteBarrierefrei(container);
  });
});
