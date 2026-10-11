// @vitest-environment jsdom
/*
 * Kachel 5: eine Abfrage (fluesse) und eine im localStorage gemerkte Auswahl (Fenster),
 * die wie bei Verlauf Teil des Query-Keys ist. Derselbe Sechser-Satz.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import type { Fluesse } from '@/lib/api';
import { FluesseKachel } from '@/features/fluesse/FluesseKachel';
import { erwarteBarrierefrei, euro, fetchErsatz, fokussieren, rendern, type Antwort } from './hilfen';
import { drift } from './fixtures';

const FLUESSE: Fluesse = {
  stand: '2026-08-26T12:08:00+02:00',
  drift: drift(),
  monate: [
    { monat: '2026-06', nettoCent: 500_000 },
    { monat: '2026-07', nettoCent: 390_000 },
    { monat: '2026-08', nettoCent: 495_000 },
  ],
  schnittCent: 37_805_537,
  schnitt12Cent: 37_805_537,
  medianCent: 495_000,
  fenster: '12m',
};

function planAbfrage(fluesse: () => Antwort) {
  return (pfad: string) => {
    if (pfad.startsWith('/api/fluesse')) return fluesse();
    throw new Error(`unerwarteter Pfad im Test: ${pfad}`);
  };
}

let wiederherstellen: (() => void) | null = null;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  wiederherstellen?.();
  wiederherstellen = null;
  localStorage.clear();
});

describe('FluesseKachel', () => {
  it('rendert mit Fixture-Daten: Kennwert und deutsches Format', async () => {
    wiederherstellen = fetchErsatz(planAbfrage(() => ({ body: FLUESSE })));
    rendern(<FluesseKachel />);

    await screen.findByRole('table', { name: de.fluesse.tabelle });
    expect(screen.getByText(euro(FLUESSE.schnittCent))).toBeInTheDocument();
  });

  it('zeigt das Skeleton, solange die Abfrage haengt', () => {
    wiederherstellen = fetchErsatz(planAbfrage(() => 'haengt'));
    const { container } = rendern(<FluesseKachel />);

    expect(screen.getByText(de.zustand.laedt)).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  /*
   * Testet den Leerzustand von FluesseAnsicht (Kachelzustand bleibt 'bereit', `daten`
   * ist gesetzt) — nicht den Kachel-eigenen `art: 'leer'`, der bei FluesseKachel nur
   * ueber `daten === undefined` entsteht und damit, wie bei KennzahlenKachel, toter
   * Code ist. Siehe die Begruendung in KennzahlenKachel.test.tsx.
   */
  it('zeigt den Leerzustand, wenn keine Monate vorliegen', async () => {
    wiederherstellen = fetchErsatz(
      planAbfrage(() => ({ body: { ...FLUESSE, monate: [] } })),
    );
    rendern(<FluesseKachel />);

    expect(await screen.findByText(de.fluesse.leer)).toBeInTheDocument();
  });

  it('zeigt den Fehlerzustand, ohne die Anwendung zu reissen, wenn der Server ablehnt', async () => {
    wiederherstellen = fetchErsatz(
      planAbfrage(() => ({
        status: 500,
        body: { fehler: { code: 'E_DB', text: 'Die Datenbank ist nicht erreichbar.' } },
      })),
    );
    rendern(<FluesseKachel />);

    expect(await screen.findByText(de.zustand.fehler)).toBeInTheDocument();
    expect(screen.getByText('Die Datenbank ist nicht erreichbar.')).toBeInTheDocument();
  });

  it('macht die Fensterwahl mit der Tastatur bedienbar und merkt sie sich', async () => {
    wiederherstellen = fetchErsatz(planAbfrage(() => ({ body: FLUESSE })));
    rendern(<FluesseKachel />);
    await screen.findByRole('table', { name: de.fluesse.tabelle });

    const maxName = de.fluesse.fensterKurz.max;
    fokussieren(screen.getByRole('radio', { name: maxName }));
    await userEvent.keyboard('{Enter}');

    // Das Fenster ist Teil des Query-Keys — die Kachel faellt kurz auf das Skeleton
    // zurueck und baut den Knopf danach neu auf, wie bei Verlauf und dem Zeitraum.
    expect(await screen.findByRole('radio', { name: maxName })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(localStorage.getItem('portfolio.fenster')).toBe('max');
  });

  it('besteht axe ohne Verstoss, sobald der Chart steht', async () => {
    wiederherstellen = fetchErsatz(planAbfrage(() => ({ body: FLUESSE })));
    const { container } = rendern(<FluesseKachel />);
    await screen.findByRole('table', { name: de.fluesse.tabelle });
    await erwarteBarrierefrei(container);
  });
});
