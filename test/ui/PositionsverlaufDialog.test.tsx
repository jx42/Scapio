// @vitest-environment jsdom
/*
 * Positionsverlauf-Dialog in Kachel 2. Die Rechnung pruefen test/core/ und test/api/; hier nur,
 * was die Oberflaeche daraus macht. In jsdom hat das Chart keine Flaeche, also liest der Test
 * die Tabellenalternative: sie zeigt dieselben Linien.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import { datumKurz, zahl } from '@/lib/format';
import type { Aufteilung, Positionsverlauf } from '@/lib/api';
import { AufteilungKachel } from '@/features/aufteilung/AufteilungKachel';
import { erwarteBarrierefrei, fetchErsatz, rendern, type Antwort } from './hilfen';
import { drift, kennzahlenAntwort, xirrOk, health } from './fixtures';

const STAND = '2026-08-26T12:08:00+02:00';
const WORLD = 'IE00B4L5Y983';
const EM = 'IE00BKM4GZ66';
const NAME_WORLD = 'iShares Core MSCI World';
const NAME_EM = 'iShares Core MSCI EM IMI';

const position = (isin: string, name: string) => ({
  isin,
  name,
  art: 'ETF',
  wertCent: 1_000_000,
  anteil: 0.5,
  investiertCent: 1_000_000,
  gewinnCent: 0,
  gewinnProzent: 0,
  realisiertCent: 0,
  xirr: xirrOk(0.05),
});

const aufteilung = (positionen = [position(WORLD, NAME_WORLD), position(EM, NAME_EM)]): Aufteilung => ({
  stand: STAND,
  drift: drift(),
  cashCent: 0,
  cashAnteil: 0,
  positionen,
});

const VERLAUF: Positionsverlauf = {
  stand: STAND,
  drift: drift(),
  zeitraeume: ['1m', '1j', 'max'],
  linien: [
    { isin: WORLD, name: NAME_WORLD, kaeufe: [{ tag: '2026-02-03', punktTag: '2026-02-03' }] },
    { isin: EM, name: NAME_EM, kaeufe: [] },
  ],
  punkte: [
    { tag: '2026-02-02', werte: { [WORLD]: 0, [EM]: 0 } },
    { tag: '2026-02-03', werte: { [WORLD]: 0.012, [EM]: -0.021 } },
  ],
};

let anfragen: string[] = [];
let wiederherstellen: (() => void) | null = null;

function plan(verlauf: () => Antwort, positionen = aufteilung()) {
  return (pfad: string) => {
    if (pfad === '/api/aufteilung') return { body: positionen };
    if (pfad === '/api/kennzahlen') return { body: kennzahlenAntwort() };
    if (pfad === '/api/health') return { body: health(false) };
    if (pfad.startsWith('/api/positionsverlauf')) {
      anfragen.push(pfad);
      return verlauf();
    }
    throw new Error(`unerwarteter Pfad im Test: ${pfad}`);
  };
}

async function oeffnen(name = NAME_WORLD) {
  const user = userEvent.setup();
  rendern(<AufteilungKachel />);
  const knopf = await screen.findByRole('button', { name: de.aufteilung.verlaufOeffnen(name) });
  await user.click(knopf);
  const dialog = await screen.findByRole('dialog');
  return { user, dialog, knopf };
}

const tabelle = () => screen.findByRole('table', { name: de.positionsverlauf.tabelle });
const spalten = async () => within(await tabelle()).getAllByRole('columnheader').map((z) => z.textContent);
const filterKnopf = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: de.positionsverlauf.filter });

beforeEach(() => {
  anfragen = [];
});

afterEach(() => {
  wiederherstellen?.();
  wiederherstellen = null;
});

describe('Positionsverlauf-Dialog', () => {
  it('oeffnet mit der geklickten Position und Zeitraum MAX', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: VERLAUF })));
    const { dialog } = await oeffnen();

    expect(within(dialog).getByRole('heading', { name: de.positionsverlauf.titel })).toBeInTheDocument();
    expect(await spalten()).toEqual([de.verlauf.spalteTag, NAME_WORLD, de.positionsverlauf.spalteKaeufe]);
    expect(anfragen).toEqual(['/api/positionsverlauf?zeitraum=max']);
  });

  it('fuehrt die Kaeufe in der Tabelle', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: VERLAUF })));
    await oeffnen();

    const zeilen = within(await tabelle()).getAllByRole('row');
    expect(zeilen.at(-1)).toHaveTextContent(de.satz.beschriftet(NAME_WORLD, datumKurz('2026-02-03')));
  });

  it('hat weder Link noch Liste', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: VERLAUF })));
    const { dialog } = await oeffnen();
    await tabelle();

    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument();
  });

  it('blendet Positionen ein, ohne neu zu fragen, und laesst das Menue offen', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: VERLAUF })));
    const { user, dialog } = await oeffnen();
    await tabelle();

    await user.click(filterKnopf(dialog));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: NAME_EM }));

    expect(await screen.findByRole('menuitemcheckbox', { name: NAME_EM })).toBeChecked();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(await spalten()).toEqual([de.verlauf.spalteTag, NAME_WORLD, NAME_EM, de.positionsverlauf.spalteKaeufe]);
    expect(anfragen).toHaveLength(1);
  });

  it('fokussiert beim Oeffnen des Menues den ersten angehakten Eintrag', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: VERLAUF })));
    const { user, dialog } = await oeffnen(NAME_EM);
    await tabelle();

    await user.click(filterKnopf(dialog));
    await waitFor(() => expect(screen.getByRole('menuitemcheckbox', { name: NAME_EM })).toHaveFocus());
  });

  it('zeigt ab sechs Linien die Anzahl statt der Tupfer', async () => {
    const isins = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF'].map((p) => `${p}00B4L5Y983`);
    const positionen = aufteilung(isins.map((isin) => position(isin, `Fonds ${isin}`)));
    wiederherstellen = fetchErsatz(
      plan(() => ({ body: { ...VERLAUF, linien: isins.map((isin) => ({ isin, name: isin, kaeufe: [] })), punkte: [{ tag: '2026-02-02', werte: Object.fromEntries(isins.map((i) => [i, 0])) }] } }), positionen),
    );
    const { user, dialog } = await oeffnen(`Fonds ${isins[0]!}`);
    await tabelle();

    await user.click(filterKnopf(dialog));
    for (const isin of isins.slice(1)) {
      await user.click(await screen.findByRole('menuitemcheckbox', { name: `Fonds ${isin}` }));
    }
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(filterKnopf(dialog)).toHaveTextContent(zahl(6));
  });

  it('zeigt bei leerer Auswahl einen Hinweis statt des Charts', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: VERLAUF })));
    const { user, dialog } = await oeffnen();
    await tabelle();

    await user.click(filterKnopf(dialog));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: NAME_WORLD }));

    expect(await within(dialog).findByText(de.positionsverlauf.leer)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: de.positionsverlauf.tabelle })).not.toBeInTheDocument();
  });

  it('sagt es, wenn eine Position keine Kurse hat', async () => {
    const ohne = { ...VERLAUF, punkte: VERLAUF.punkte.map((p) => ({ ...p, werte: { [WORLD]: null, [EM]: 0 } })) };
    wiederherstellen = fetchErsatz(plan(() => ({ body: ohne })));
    const { dialog } = await oeffnen();

    expect(await within(dialog).findByText(de.positionsverlauf.ohneKurse)).toBeInTheDocument();
  });

  it('meldet einen Fehler und laesst den Zeitraum weiter waehlen', async () => {
    wiederherstellen = fetchErsatz(
      plan(() => ({ status: 500, body: { fehler: { code: 'E_INTERN', text: 'Kaputt.', hinweis: 'Später noch einmal.' } } })),
    );
    const { dialog } = await oeffnen();

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: de.positionsverlauf.filter })).toBeInTheDocument();
  });

  it('setzt Zeitraum und Auswahl beim erneuten Oeffnen zurueck und gibt den Fokus zurueck', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: VERLAUF })));
    const { user, dialog, knopf } = await oeffnen();
    await tabelle();

    await user.click(filterKnopf(dialog));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: NAME_EM }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await user.click(within(dialog).getByRole('radio', { name: de.verlauf.zeitraeume['1j'] }));
    await waitFor(() => expect(anfragen).toContain('/api/positionsverlauf?zeitraum=1j'));

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(knopf).toHaveFocus());

    await user.click(knopf);
    await screen.findByRole('dialog');
    expect(await spalten()).toEqual([de.verlauf.spalteTag, NAME_WORLD, de.positionsverlauf.spalteKaeufe]);
    expect(screen.getByRole('radio', { name: de.verlauf.zeitraeume.max })).toBeChecked();
  });

  it('besteht axe ohne Verstoss', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: VERLAUF })));
    const { dialog } = await oeffnen();
    await tabelle();
    await erwarteBarrierefrei(dialog);
  });
});
