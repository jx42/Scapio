// @vitest-environment jsdom
/*
 * Der gemeinsame Vertrag aus Abschnitt 10.2: die Zustaende und die ErrorBoundary. Jede
 * Kachel erbt das von <Kachel> — hier wird es einmal geprueft, statt in jeder Kachel.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import { Kachel } from '@/components/Kachel';
import { erwarteBarrierefrei } from './hilfen';

function Kaputt(): never {
  throw new Error('absichtlich kaputt fuer den Test');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Kachel: die Zustaende', () => {
  it('zeigt Titel und Inhalt, wenn bereit', () => {
    render(
      <Kachel titel="Verlauf" id="verlauf" zustand={{ art: 'bereit' }}>
        <p>Inhalt</p>
      </Kachel>,
    );
    expect(screen.getByRole('heading', { name: 'Verlauf', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });

  it('zeigt das Skeleton beim Laden, als aria-busy angekuendigt', async () => {
    const { container } = render(<Kachel titel="Verlauf" id="verlauf" zustand={{ art: 'laedt' }}>x</Kachel>);
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(screen.getByText(de.zustand.laedt)).toBeInTheDocument();
    await erwarteBarrierefrei(container);
  });

  it('zeigt den Leerzustand mit eigenem Text', async () => {
    const { container } = render(
      <Kachel titel="Aufteilung" id="aufteilung" zustand={{ art: 'leer', text: 'Keine Positionen im Bestand.' }}>
        x
      </Kachel>,
    );
    expect(screen.queryByText('Noch keine Daten')).toBeNull();
    expect(screen.getByText('Keine Positionen im Bestand.')).toBeInTheDocument();
    await erwarteBarrierefrei(container);
  });

  it('zeigt Fehlertext und Hinweis, ohne Stacktrace', async () => {
    const { container } = render(
      <Kachel
        titel="Kennzahlen"
        id="kennzahlen"
        zustand={{ art: 'fehler', text: 'E_NETZ: kein Server erreichbar', hinweis: 'Prüfe, ob npm start läuft.' }}
      >
        x
      </Kachel>,
    );
    // Live-Region: ein Screenreader erfaehrt vom Fehler, ohne dorthin zu navigieren (WCAG 4.1.3).
    expect(screen.getByRole('alert')).toHaveTextContent(de.zustand.fehler);
    expect(screen.getByText('E_NETZ: kein Server erreichbar')).toBeInTheDocument();
    expect(screen.getByText('Prüfe, ob npm start läuft.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/at .*:\d+:\d+/);
    await erwarteBarrierefrei(container);
  });
});


describe('Kachel: Fehlerisolation [P-06]', () => {
  it('ueberlebt einen Absturz beim Zeichnen, ohne die Nachbarkachel zu reissen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <>
        <Kachel titel="Verlauf" id="verlauf" zustand={{ art: 'bereit' }}>
          <Kaputt />
        </Kachel>
        <Kachel titel="Kennzahlen" id="kennzahlen" zustand={{ art: 'bereit' }}>
          <p>Kennzahlen-Inhalt</p>
        </Kachel>
      </>,
    );

    const verlauf = screen.getByRole('region', { name: 'Verlauf' });
    expect(within(verlauf).getByText(de.zustand.abgestuerzt)).toBeInTheDocument();

    const kennzahlen = screen.getByRole('region', { name: 'Kennzahlen' });
    expect(within(kennzahlen).getByText('Kennzahlen-Inhalt')).toBeInTheDocument();
  });
});

describe('Kachel: Tastatur', () => {
  it('macht Werkzeuge in der Kopfzeile mit der Tastatur erreichbar', async () => {
    const klick = vi.fn();
    render(
      <Kachel
        titel="Verlauf"
        id="verlauf"
        zustand={{ art: 'bereit' }}
        werkzeuge={<button type="button" onClick={klick}>Aktualisieren</button>}
      >
        <p>Inhalt</p>
      </Kachel>,
    );
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Aktualisieren' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(klick).toHaveBeenCalledTimes(1);
  });
});
