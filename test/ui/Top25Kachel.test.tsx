// @vitest-environment jsdom
/*
 * Kachel 4: keine Auswahl, eine Tabelle mit allen Zeilen und ein Aufschluesseln-Knopf
 * je Zeile mit ausFonds. Derselbe Sechser-Satz wie ueberall in test/ui/. Kein
 * <ChartRahmen> hier — keine verborgene Tabelle, also keine Text-Kollisionen wie bei
 * Aufteilung/Verlauf.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import type { FehlenderFonds, Top25, UnternehmenZeile } from '@/lib/api';
import { zahl } from '@/lib/format';
import { Top25Kachel } from '@/features/top25/Top25Kachel';
import { erwarteBarrierefrei, euro, fetchErsatz, prozentText, rendern } from './hilfen';
import { drift, unternehmenZeile } from './fixtures';

const APPLE: UnternehmenZeile = unternehmenZeile(1, {
  name: 'Apple Inc.',
  isin: 'US0378331005',
  exposureCent: 37_805_537,
  anteilDepot: 0.15,
  ausFonds: [
    { isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World', anteilCent: 30_000_000 },
    { isin: 'IE00BKM4GZ66', anteilCent: 7_805_537 },
  ],
});

const ZEILEN = [APPLE, ...Array.from({ length: 14 }, (_, i) => unternehmenZeile(i + 2))];

const FIXTURE: Top25 = {
  stand: '2026-08-26T12:08:00+02:00',
  drift: drift(),
  topAnteil: ZEILEN.reduce((summe, z) => summe + z.anteilDepot, 0),
  abdeckung: 0.83,
  durchschautCent: 37_805_537,
  anzahlUnternehmen: 1842,
  fehlendeFonds: [],
  zeilen: ZEILEN,
};

const GESPERRTER_FONDS: FehlenderFonds = {
  isin: 'US33734X1080',
  name: 'First Trust Platzhalter-ETF',
  anbieter: 'firsttrust',
  fall: 'gesperrt',
};

const GESCHEITERTER_FONDS: FehlenderFonds = {
  isin: 'LU0000000001',
  name: 'Xtrackers Platzhalter-ETF',
  anbieter: 'xtrackers',
  fall: 'abrufGescheitert',
};

let wiederherstellen: (() => void) | null = null;

afterEach(() => {
  localStorage.clear();
  wiederherstellen?.();
  wiederherstellen = null;
});

describe('Top25Kachel', () => {
  it('zeigt standardmäßig 10 Zeilen und lässt die restlichen ein- und ausklappen', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<Top25Kachel />);

    const tabelle = await screen.findByRole('table', {
      name: de.top25.tabelle(zahl(1), zahl(10)),
    });

    expect(
      screen.getByText(de.top25.untertitel(prozentText(FIXTURE.topAnteil), zahl(1842))),
    ).toBeInTheDocument();
    expect(within(tabelle).getByText(euro(APPLE.exposureCent))).toBeInTheDocument();
    expect(within(tabelle).getByText('Apple Inc.')).toBeInTheDocument();
    expect(within(tabelle).queryByText('Firma 15')).not.toBeInTheDocument();
    // Zweimal: als eigene Spalte ab `sm`, darunter unter dem Namen — jsdom kennt kein CSS.
    expect(within(tabelle).getAllByText('iShares Core MSCI World, IE00BKM4GZ66')).toHaveLength(2);
    const mehr = screen.getByRole('button', { name: de.top25.mehrZeigen });
    await userEvent.click(mehr);
    expect(await screen.findByRole('table', { name: de.top25.tabelle(zahl(1), zahl(15)) })).toBeInTheDocument();
    expect(screen.getByText('Firma 15')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: de.top25.wenigerZeigen })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: de.top25.wenigerZeigen }));
    expect(await screen.findByRole('table', { name: de.top25.tabelle(zahl(1), zahl(10)) })).toBeInTheDocument();
    expect(screen.queryByText('Firma 15')).not.toBeInTheDocument();
  });

  it('zeigt das Skeleton, solange die Abfrage haengt', () => {
    wiederherstellen = fetchErsatz(() => 'haengt');
    const { container } = rendern(<Top25Kachel />);

    expect(screen.getByText(de.zustand.laedt)).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('zeigt bei leerer Kachel ohne bekannte Fonds im Kasten den Knopf zur Anleitung, die Anleitung im Dialog', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: { ...FIXTURE, zeilen: [] } }));
    rendern(<Top25Kachel />);

    const knopf = await screen.findByRole('button', { name: de.top25.leerAnleitungTitel });
    expect(screen.queryByText(de.top25.leer)).not.toBeInTheDocument();
    expect(screen.queryByText(de.top25.leerAnleitungSchritte[0]!)).not.toBeInTheDocument();

    await userEvent.click(knopf);
    const dialog = screen.getByRole('dialog', { name: de.top25.leerAnleitungTitel });
    for (const schritt of de.top25.leerAnleitungSchritte) {
      expect(within(dialog).getByText(schritt)).toBeInTheDocument();
    }
  });

  it('zeigt bei leerer Kachel im Kasten den Knopf zu den fehlenden Fonds statt der Anleitung, wenn welche bekannt sind', async () => {
    wiederherstellen = fetchErsatz(() => ({
      body: { ...FIXTURE, zeilen: [], fehlendeFonds: [GESPERRTER_FONDS, GESCHEITERTER_FONDS] },
    }));
    rendern(<Top25Kachel />);

    const knopf = await screen.findByRole('button', { name: de.top25.fehlendeFondsUntertitel(zahl(2)) });
    expect(screen.queryByText(de.top25.leer)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de.top25.leerAnleitungTitel })).not.toBeInTheDocument();
    expect(screen.queryByText(GESPERRTER_FONDS.name)).not.toBeInTheDocument();

    await userEvent.click(knopf);
    const dialog = screen.getByRole('dialog', { name: de.top25.fehlendeFondsTitel });
    expect(within(dialog).getByText(GESPERRTER_FONDS.name)).toBeInTheDocument();
    expect(within(dialog).getByText(GESCHEITERTER_FONDS.name)).toBeInTheDocument();
  });

  it('zeigt den Fehlerzustand, ohne die Anwendung zu reissen, wenn der Server ablehnt', async () => {
    wiederherstellen = fetchErsatz(() => ({
      status: 500,
      body: { fehler: { code: 'E_DB', text: 'Die Datenbank ist nicht erreichbar.' } },
    }));
    rendern(<Top25Kachel />);

    expect(await screen.findByText(de.zustand.fehler)).toBeInTheDocument();
    expect(screen.getByText('Die Datenbank ist nicht erreichbar.')).toBeInTheDocument();
  });

  it('zeigt den dritten Untertitelteil und den Dialog mit den fehlenden Fonds', async () => {
    wiederherstellen = fetchErsatz(() => ({
      body: { ...FIXTURE, fehlendeFonds: [GESPERRTER_FONDS, GESCHEITERTER_FONDS] },
    }));
    rendern(<Top25Kachel />);

    const knopf = await screen.findByRole('button', { name: de.top25.fehlendeFondsUntertitel(zahl(2)) });
    await userEvent.click(knopf);

    expect(screen.getByRole('dialog', { name: de.top25.fehlendeFondsTitel })).toBeInTheDocument();
    expect(screen.getByText(de.top25.fehlendeFondsEinleitung(prozentText(FIXTURE.abdeckung)))).toBeInTheDocument();
    expect(screen.getByText(`(${GESPERRTER_FONDS.isin})`)).toBeInTheDocument();
    expect(
      screen.getByText(
        de.top25.fehlendeFondsGesperrt(de.top25.anbieterName[GESPERRTER_FONDS.anbieter] ?? GESPERRTER_FONDS.anbieter),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(de.top25.fehlendeFondsAbrufGescheitert)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: de.top25.fundsJsonKopierenKnopf })).toBeInTheDocument();
  });

  it('kopiert den funds.json-Baustein fuer einen aufloesbaren Anbieter in die Zwischenablage', async () => {
    const schreiben = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: schreiben } });
    wiederherstellen = fetchErsatz(() => ({
      body: { ...FIXTURE, fehlendeFonds: [GESCHEITERTER_FONDS] },
    }));
    rendern(<Top25Kachel />);

    const knopf = await screen.findByRole('button', { name: de.top25.fehlendeFondsUntertitel(zahl(1)) });
    await userEvent.click(knopf);
    await userEvent.click(screen.getByRole('button', { name: de.top25.fundsJsonKopierenKnopf }));

    expect(schreiben).toHaveBeenCalledWith(
      JSON.stringify(
        { anbieter: GESCHEITERTER_FONDS.anbieter, isin: GESCHEITERTER_FONDS.isin, name: GESCHEITERTER_FONDS.name },
        null,
        2,
      ),
    );
  });

  it('macht die Tabelle bei Ueberlauf mit der Tastatur erreichbar und kuerzt keine Namen', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    rendern(<Top25Kachel />);
    const name = de.top25.tabelle(zahl(1), zahl(10));
    await screen.findByRole('table', { name });

    expect(screen.getByRole('region', { name })).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('Apple Inc.')).not.toHaveClass('truncate');
  });

  it('besteht axe ohne Verstoss, sobald die Tabelle steht', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    const { container } = rendern(<Top25Kachel />);
    await screen.findByRole('table', { name: de.top25.tabelle(zahl(1), zahl(10)) });
    await erwarteBarrierefrei(container);
  });
});
