// @vitest-environment jsdom
/*
 * Rebalancing-Rechner in Kachel 2: Eingabe, Summenpruefung, Ergebnis, Speicher. Die
 * Rechnung selbst pruefen test/core/ und test/server/; hier nur, was die Oberflaeche zeigt.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import { prozent } from '@/lib/format';
import type { Aufteilung, Rebalancing } from '@/lib/api';
import { AufteilungKachel } from '@/features/aufteilung/AufteilungKachel';
import { bpAusEingabe, zielLesen } from '@/features/aufteilung/zielaufteilung';
import { erwarteBarrierefrei, euro, fetchErsatz, rendern, type Antwort } from './hilfen';
import { drift, kennzahlenAntwort, xirrOk } from './fixtures';

const STAND = '2026-08-26T12:08:00+02:00';
const WORLD = 'IE00B4L5Y983';
const EM = 'IE00BKM4GZ66';

const position = (isin: string, name: string, wertCent: number, anteil: number) => ({
  isin,
  name,
  art: 'ETF',
  wertCent,
  anteil,
  investiertCent: wertCent,
  gewinnCent: 0,
  gewinnProzent: 0,
  realisiertCent: 0,
  xirr: xirrOk(0.05),
});

const AUFTEILUNG: Aufteilung = {
  stand: STAND,
  drift: drift(),
  cashCent: 1_000_000,
  cashAnteil: 0.1,
  positionen: [position(WORLD, 'iShares Core MSCI World', 7_000_000, 0.7), position(EM, 'iShares Core MSCI EM IMI', 2_000_000, 0.2)],
};

const zeile = (schluessel: string, istCent: number, zielBp: number, deltaCent: number) => ({
  schluessel,
  name: null,
  imDepot: true,
  istCent,
  istAnteil: istCent / 10_000_000,
  zielBp,
  sollCent: istCent + deltaCent,
  deltaCent,
});

const ERGEBNIS: Rebalancing = {
  stand: STAND,
  drift: drift(),
  art: 'ok',
  gesamtCent: 10_000_000,
  zeilen: [zeile('KONTO', 1_000_000, 0, -1_000_000), zeile(WORLD, 7_000_000, 5000, -2_000_000), zeile(EM, 2_000_000, 5000, 3_000_000)],
};

let anfragen: string[] = [];
let wiederherstellen: (() => void) | null = null;

function plan(rebalancing: () => Antwort = () => ({ body: ERGEBNIS })) {
  return (pfad: string) => {
    if (pfad === '/api/aufteilung') return { body: AUFTEILUNG };
    if (pfad === '/api/kennzahlen') return { body: kennzahlenAntwort() };
    if (pfad.startsWith('/api/rebalancing?')) {
      anfragen.push(pfad);
      return rebalancing();
    }
    throw new Error(`unerwarteter Pfad im Test: ${pfad}`);
  };
}

async function oeffnen() {
  const user = userEvent.setup();
  rendern(<AufteilungKachel />);
  await user.click(await screen.findByRole('button', { name: de.rebalancing.knopf }));
  const dialog = await screen.findByRole('dialog');
  return { user, dialog };
}

async function fuenfzigFuenfzig(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.type(feld(dialog, AUFTEILUNG.positionen[0]!.name), '50');
  await user.type(feld(dialog, AUFTEILUNG.positionen[1]!.name), '50');
}

const feld = (dialog: HTMLElement, name: string) => within(dialog).getByLabelText(de.rebalancing.zielFeld(name));

beforeEach(() => {
  localStorage.clear();
  anfragen = [];
});

afterEach(() => {
  wiederherstellen?.();
  wiederherstellen = null;
  localStorage.clear();
});

describe('Eingabehilfen', () => {
  it('liest Prozent mit einer Nachkommastelle in Basispunkten', () => {
    expect(bpAusEingabe('')).toBe(0);
    expect(bpAusEingabe('12,5')).toBe(1250);
    expect(bpAusEingabe('12.5')).toBe(1250);
    expect(bpAusEingabe('100')).toBe(10_000);
    expect(bpAusEingabe('100,1')).toBeNull();
    expect(bpAusEingabe('1,25')).toBeNull();
    expect(bpAusEingabe('-1')).toBeNull();
    expect(bpAusEingabe('abc')).toBeNull();
  });

  it('verwirft einen manipulierten Speicher zeilenweise', () => {
    localStorage.setItem(
      'portfolio.zielaufteilung',
      JSON.stringify({ ziel: { KONTO: 500, [WORLD]: 1.5, quatsch: 100, [EM]: 20_000 }, ausgeschlossen: ['X', 7, EM] }),
    );
    const z = zielLesen();
    expect([...z.ziel]).toEqual([['KONTO', 500]]);
    expect(z.ausgeschlossen).toEqual([EM]);
  });

  it('kaputtes JSON ergibt ein leeres Ziel', () => {
    localStorage.setItem('portfolio.zielaufteilung', '{');
    expect(zielLesen().ziel.size).toBe(0);
  });
});

describe('RebalancingDialog', () => {
  it('sperrt Berechnen, bis die Summe 100 % ergibt, und nennt die Differenz', async () => {
    wiederherstellen = fetchErsatz(plan());
    const { user, dialog } = await oeffnen();
    const knopf = within(dialog).getByRole('button', { name: de.rebalancing.berechnen });
    expect(knopf).toBeDisabled();

    await user.type(feld(dialog, AUFTEILUNG.positionen[0]!.name), '60');
    expect(knopf).toBeDisabled();
    expect(knopf).toHaveAccessibleDescription(de.rebalancing.summeFehlt(prozent(0.4)));

    await user.type(feld(dialog, AUFTEILUNG.positionen[1]!.name), '40');
    expect(knopf).toBeEnabled();
    expect(anfragen).toEqual([]);
  });

  it('markiert ein ungueltiges Feld und verweist auf die Meldung', async () => {
    wiederherstellen = fetchErsatz(plan());
    const { user, dialog } = await oeffnen();
    const f = feld(dialog, de.rebalancing.konto);
    await user.type(f, '1,25');
    expect(f).toHaveAttribute('aria-invalid', 'true');
    expect(f).toHaveAccessibleDescription(de.rebalancing.feldUngueltig);
    expect(within(dialog).getByRole('button', { name: de.rebalancing.berechnen })).toBeDisabled();
  });

  it('Berechnen: Ergebnis mit Wort und Vorzeichen, Ziel gemerkt', async () => {
    wiederherstellen = fetchErsatz(plan());
    const { user, dialog } = await oeffnen();
    await fuenfzigFuenfzig(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: de.rebalancing.berechnen }));
    expect(await within(dialog).findByText(de.rebalancing.betrag(euro(3_000_000, true), de.rebalancing.richtung.kaufen))).toBeInTheDocument();
    expect(within(dialog).getByText(de.rebalancing.betrag(euro(-2_000_000, true), de.rebalancing.richtung.verkaufen))).toBeInTheDocument();
    expect(within(dialog).getByText(de.rebalancing.betrag(euro(-1_000_000, true), de.rebalancing.richtung.vomKonto))).toBeInTheDocument();
    expect(anfragen).toEqual([`/api/rebalancing?ziel=${encodeURIComponent(`KONTO:0,${WORLD}:5000,${EM}:5000`)}`]);
    expect(zielLesen().ziel.get(EM)).toBe(5000);
    await erwarteBarrierefrei(dialog);
  });

  it('eine geaenderte Eingabe macht das Ergebnis veraltet', async () => {
    wiederherstellen = fetchErsatz(plan());
    const { user, dialog } = await oeffnen();
    await fuenfzigFuenfzig(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: de.rebalancing.berechnen }));
    await within(dialog).findByText(de.rebalancing.fertig);
    await user.click(within(dialog).getByLabelText(de.rebalancing.einbeziehen(de.rebalancing.konto)));
    expect(within(dialog).getByRole('status')).toHaveTextContent(de.rebalancing.veraltet);
  });

  it('eine ausgeschlossene Zeile faellt aus Ziel und Summe und bleibt gemerkt', async () => {
    wiederherstellen = fetchErsatz(plan());
    const { user, dialog } = await oeffnen();
    await user.type(feld(dialog, de.rebalancing.konto), '20');
    await user.type(feld(dialog, AUFTEILUNG.positionen[0]!.name), '100');
    await user.click(within(dialog).getByLabelText(de.rebalancing.einbeziehen(de.rebalancing.konto)));
    expect(feld(dialog, de.rebalancing.konto)).toBeDisabled();
    expect(within(dialog).getByText(de.rebalancing.ausgeschlossen)).toBeInTheDocument();
    expect(within(dialog).getByText(de.rebalancing.bezugEinbezogen)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: de.rebalancing.berechnen }));
    expect(anfragen).toEqual([`/api/rebalancing?ziel=${encodeURIComponent(`${WORLD}:10000,${EM}:0`)}`]);
    const gemerkt = zielLesen();
    expect(gemerkt.ausgeschlossen).toEqual(['KONTO']);
    expect(gemerkt.ziel.get('KONTO')).toBe(2000);
  });

  it('ohne einbezogene Zeile laesst sich nichts berechnen', async () => {
    wiederherstellen = fetchErsatz(plan());
    const { user, dialog } = await oeffnen();
    for (const name of [de.rebalancing.konto, ...AUFTEILUNG.positionen.map((p) => p.name)]) {
      await user.click(within(dialog).getByLabelText(de.rebalancing.einbeziehen(name)));
    }
    const knopf = within(dialog).getByRole('button', { name: de.rebalancing.berechnen });
    expect(knopf).toBeDisabled();
    expect(knopf).toHaveAccessibleDescription(de.rebalancing.nichtsEinbezogen);
  });

  it('belegt aus dem Speicher vor; eine verkaufte Position faellt heraus', async () => {
    localStorage.setItem(
      'portfolio.zielaufteilung',
      JSON.stringify({ ziel: { KONTO: 1000, [WORLD]: 9000, US0378331005: 500 }, ausgeschlossen: [EM, 'US0378331005'] }),
    );
    wiederherstellen = fetchErsatz(plan());
    const { dialog } = await oeffnen();
    expect(feld(dialog, de.rebalancing.konto)).toHaveValue('10,0');
    expect(feld(dialog, AUFTEILUNG.positionen[0]!.name)).toHaveValue('90,0');
    expect(feld(dialog, AUFTEILUNG.positionen[1]!.name)).toBeDisabled();
    expect(within(dialog).queryByText('US0378331005')).toBeNull();
    expect(within(dialog).getByRole('button', { name: de.rebalancing.berechnen })).toBeEnabled();
  });

  it('zeigt bei Drift-Abbruch kein Ergebnis', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ body: { ...ERGEBNIS, drift: drift('abbruch') } })));
    const { user, dialog } = await oeffnen();
    await fuenfzigFuenfzig(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: de.rebalancing.berechnen }));
    expect(await within(dialog).findByText(de.rebalancing.driftAbbruch)).toBeInTheDocument();
    expect(within(dialog).queryByText(de.rebalancing.betrag(euro(3_000_000, true), de.rebalancing.richtung.kaufen))).toBeNull();
  });

  it('meldet einen abgelehnten Parameter als Alarm', async () => {
    wiederherstellen = fetchErsatz(plan(() => ({ status: 400, body: { code: 'E_PARAMETER', text: 'Ziel ungültig.' } })));
    const { user, dialog } = await oeffnen();
    await fuenfzigFuenfzig(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: de.rebalancing.berechnen }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
  });
});
