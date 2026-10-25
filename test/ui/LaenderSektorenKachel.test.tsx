// @vitest-environment jsdom
/*
 * Kachel 4, rechte Hälfte: Ringe fuer Laender und Sektoren. Die Ringe stehen in <ChartRahmen> mit
 * verborgener Tabelle — dort deshalb nach Rolle fragen, nicht nach Text.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import type { Gruppe, Top25 } from '@/lib/api';
import { LaenderSektorenKachel } from '@/features/top25/LaenderSektorenKachel';
import { erwarteBarrierefrei, fetchErsatz, rendern } from './hilfen';
import { drift, unternehmenZeile } from './fixtures';

const LAENDER: Gruppe[] = [
  { name: 'United States', exposureCent: 25_000_000, anteil: 0.6 },
  ...['Japan', 'Germany', 'France', 'Canada', 'Switzerland'].map((name) => ({
    name,
    exposureCent: 1_000_000,
    anteil: 0.05,
  })),
  { name: null, exposureCent: 5_000_000, anteil: 0.15 },
];

const BASIS: Top25 = {
  stand: '2026-08-26T12:08:00+02:00',
  drift: drift(),
  topAnteil: 0.15,
  abdeckung: 0.83,
  durchschautCent: 37_805_537,
  anzahlUnternehmen: 1842,
  laender: [
    { name: 'United States', exposureCent: 25_000_000, anteil: 0.7 },
    { name: null, exposureCent: 5_700_000, anteil: 0.3 },
  ],
  sektoren: [
    { name: 'Information Technology', exposureCent: 20_000_000, anteil: 0.56 },
    { name: 'Raumfahrt', exposureCent: 15_700_000, anteil: 0.44 },
  ],
  fehlendeFonds: [],
  zeilen: [unternehmenZeile(1)],
};

const FIXTURE: Top25 = { ...BASIS, laender: LAENDER };

let wiederherstellen: (() => void) | null = null;

afterEach(() => {
  localStorage.clear();
  wiederherstellen?.();
  wiederherstellen = null;
});

describe('LaenderSektorenKachel', () => {
  it('zeigt beide Ringe mit deutschen Namen, je fuenf Zeilen und klappt den Rest auf', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: FIXTURE }));
    const { container } = rendern(<LaenderSektorenKachel />);

    expect(await screen.findByRole('img', { name: de.top25.ringLaender })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: de.top25.ringSektoren })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^1 USA/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^1 IT/ })).toBeInTheDocument();
    // Unbekanntes bleibt Rohtext.
    expect(screen.getByRole('button', { name: /^\d+ Raumfahrt/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Übrige/ })).not.toBeInTheDocument();

    const mehr = screen.getByRole('button', { name: de.top25.mehrZeigen });
    expect(mehr).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(mehr);
    expect(screen.getByRole('button', { name: /^Übrige/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: de.top25.wenigerZeigen })).toHaveAttribute('aria-expanded', 'true');
    await erwarteBarrierefrei(container);
  });

  it('zeigt keinen Knopf, wenn alle Gruppen in fuenf Zeilen passen', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: BASIS }));
    rendern(<LaenderSektorenKachel />);

    expect(await screen.findByRole('button', { name: /^Übrige/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de.top25.mehrZeigen })).not.toBeInTheDocument();
  });

  it('zeigt den Leerzustand ohne Laender und Sektoren', async () => {
    wiederherstellen = fetchErsatz(() => ({ body: { ...BASIS, laender: [], sektoren: [] } }));
    rendern(<LaenderSektorenKachel />);

    expect(await screen.findByText(de.top25.leer)).toBeInTheDocument();
  });
});
