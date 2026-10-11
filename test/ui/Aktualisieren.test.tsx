// @vitest-environment jsdom
/*
 * AktualisierenAnsicht ist bewusst eine reine Ansicht ohne Query und ohne Timer
 * ("So laesst sie sich ohne Server pruefen", siehe Aktualisieren.tsx) — deshalb wird
 * hier direkt mit Props gerendert statt ueber einen fetch-Ersatz.
 *
 * Der Container `Aktualisieren` bekommt am Ende der Datei eigene Faelle: er entscheidet,
 * WELCHER Lauf gerade laeuft, und das laesst sich nur mit einem fetch-Ersatz pruefen.
 * Den Takt der Abfrage (1,5 s) ueberspringt eine falsche Uhr, statt ihn abzuwarten.
 */

import { Profiler, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import {
  Aktualisieren,
  AktualisierenAnsicht,
  type AktualisierenAnsichtProps,
  type McpAnmeldungStatus,
} from '@/components/Aktualisieren';
import { erwarteBarrierefrei, fetchErsatz, fokussieren, rendern } from './hilfen';

const BASIS: AktualisierenAnsichtProps = {
  kannAktualisieren: true,
  demo: false,
  laeuft: false,
  anmeldungNoetig: false,
  anmeldungLaeuft: false,
  onKlick: vi.fn(),
};

describe('AktualisierenAnsicht — Anmeldung am MCP [ADR-012]', () => {
  it('zeigt keinen eigenen Anmeldeknopf — der steht im Alert der Seite (App.tsx)', () => {
    rendern(<AktualisierenAnsicht {...BASIS} anmeldungNoetig={true} anmeldungLaeuft={true} />);
    expect(screen.queryByRole('button', { name: de.mcpAnmeldung.knopf })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(de.mcpAnmeldung.laeuft) })).not.toBeInTheDocument();
  });

  it('sperrt den Aktualisieren-Knopf, solange die Anmeldung faellig ist', () => {
    rendern(<AktualisierenAnsicht {...BASIS} anmeldungNoetig={true} />);
    expect(screen.getByRole('button', { name: de.aktualisieren.knopf })).toBeDisabled();
  });

  it('sperrt den Aktualisieren-Knopf, solange die Anmeldung laeuft', () => {
    rendern(<AktualisierenAnsicht {...BASIS} anmeldungLaeuft={true} />);
    expect(screen.getByRole('button', { name: de.aktualisieren.knopf })).toBeDisabled();
  });
});

describe('AktualisierenAnsicht — Demo-Modus', () => {
  it('meldet den Aktualisieren-Knopf als inaktiv und loest bei einem Klick nichts aus', async () => {
    const onKlick = vi.fn();
    rendern(<AktualisierenAnsicht {...BASIS} demo={true} onKlick={onKlick} />);
    const knopf = screen.getByRole('button', { name: de.aktualisieren.knopf });
    expect(knopf).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(knopf);
    expect(onKlick).not.toHaveBeenCalled();
  });

  it('nennt den Grund erst im Popover, nicht als staendig sichtbaren Text', async () => {
    rendern(<AktualisierenAnsicht {...BASIS} demo={true} />);
    expect(screen.queryByText(de.aktualisieren.demo)).not.toBeInTheDocument();

    // Mit der Tastatur, nicht nur per Zeiger: `aria-disabled` laesst den Knopf im Fokus.
    fokussieren(screen.getByRole('button', { name: de.aktualisieren.knopf }));
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByText(de.aktualisieren.demo)).toBeInTheDocument();
  });

  it('dimmt nur den Inhalt, nicht den Knopf mit seinem Fokusring', () => {
    rendern(<AktualisierenAnsicht {...BASIS} demo={true} />);
    expect(screen.getByRole('button', { name: de.aktualisieren.knopf })).not.toHaveClass('opacity-50');
  });

  it('bleibt mit dem inaktiven Knopf und seinem Popover barrierefrei', async () => {
    const { container } = rendern(<AktualisierenAnsicht {...BASIS} demo={true} />);
    await erwarteBarrierefrei(container);
  });

  it('laesst den Knopf ausserhalb des Demo-Modus bedienbar und ohne Popover', async () => {
    const onKlick = vi.fn();
    rendern(<AktualisierenAnsicht {...BASIS} onKlick={onKlick} />);
    const knopf = screen.getByRole('button', { name: de.aktualisieren.knopf });
    expect(knopf).toBeEnabled();
    await userEvent.click(knopf);
    expect(onKlick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(de.aktualisieren.demo)).not.toBeInTheDocument();
  });
});

/*
 * Der Container dagegen haelt den Zustand — welcher Lauf gerade laeuft — und braucht
 * dafuer einen fetch-Ersatz. Geprueft wird genau die Verwechslung, die ihn frueher beim
 * ersten Klick sofort wieder anhalten liess: `/api/lauf` haelt im Cache noch den VORIGEN,
 * bereits beendeten Lauf, und dessen Endstatus ist nicht das Ende des eben gestarteten.
 */

const DRIFT = { stufe: 'ok', abweichung: 0 } as const;
const ABFRAGETAKT_MS = 1500;

/** `shouldAdvanceTime`: userEvent und waitFor brauchen weiter eine Uhr, die von selbst laeuft. */
function falscheUhr(): void {
  vi.useFakeTimers({ shouldAdvanceTime: true });
}

function laufAntwort(laufId: number | null, status: string | null, schritt: string | null = null) {
  return {
    laufId,
    status,
    schritt,
    quellen: status === 'laufend' ? { holdings: 'erfolg', cash: 'erfolg', kurse: 'fehler' } : {},
    hinweise: [],
    gestartet: laufId === null ? null : '2026-09-07T08:00:00.000Z',
    beendet: status === null || status === 'laufend' ? null : '2026-09-07T08:00:30.000Z',
    fehler: null,
    stand: null,
    drift: DRIFT,
  };
}

const GESTARTET = (laufId: number) => ({ status: 202, body: { laufId, stand: null, drift: DRIFT } });

const BELEGT = (laufId: number) => ({
  status: 409,
  body: {
    laufId,
    quelle: 'api',
    seit: '2026-09-07T08:00:00.000Z',
    fehler: {
      code: 'E_SPERRE',
      text: 'Es laeuft bereits eine Aktualisierung.',
      hinweis: 'Warte, bis der laufende Lauf fertig ist.',
    },
  },
});

describe('Aktualisieren — der Lauf, auf den der Klick wartet', () => {
  let aufraeumen: readonly (() => void)[] = [];
  let laufJetzt: ReturnType<typeof laufAntwort>;
  let laufAbrufe = 0;
  let refreshAbrufe = 0;
  let refreshAntwort: { status: number; body: unknown };
  /** Was `/api/lauf` ab dem POST meldet — der Server schreibt die Zeile vor der 202. */
  let nachDemStart: ReturnType<typeof laufAntwort>;

  beforeEach(() => {
    laufAbrufe = 0;
    refreshAbrufe = 0;
    laufJetzt = laufAntwort(7, 'erfolg');
    nachDemStart = laufAntwort(8, 'laufend');
    refreshAntwort = GESTARTET(8);

    const meta = document.createElement('meta');
    meta.setAttribute('name', 'portfolio-token');
    meta.setAttribute('content', 'test-token');
    document.head.append(meta);

    const zurueck = fetchErsatz((pfad) => {
      if (pfad === '/api/refresh') {
        refreshAbrufe += 1;
        laufJetzt = nachDemStart;
        return refreshAntwort;
      }
      if (pfad === '/api/lauf') {
        laufAbrufe += 1;
        return { body: laufJetzt };
      }
      return { status: 404, body: {} };
    });

    aufraeumen = [
      () => {
        meta.remove();
      },
      zurueck,
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const schritt of aufraeumen) schritt();
  });

  it('bleibt im Lauf, obwohl /api/lauf beim Klick noch den vorigen, beendeten meldet', async () => {
    // Der Server hat die Nummer nicht mehr abgewartet, und /api/lauf zeigt weiter den
    // alten Lauf: der schaerfste Fall — ohne Nummernvergleich sprang der Knopf hier
    // sofort zurueck, obwohl der Lauf auf dem Server begonnen hatte.
    refreshAntwort = GESTARTET(0);
    nachDemStart = laufAntwort(7, 'erfolg');

    rendern(<Aktualisieren />);
    await waitFor(() => expect(laufAbrufe).toBe(1));

    await userEvent.click(screen.getByRole('button', { name: de.aktualisieren.knopf }));

    // Ein zweiter Abruf ist durch: der Zeitpunkt, an dem frueher der alte Endstatus
    // als der eigene gelesen wurde.
    await waitFor(() => expect(laufAbrufe).toBeGreaterThanOrEqual(2));
    expect(refreshAbrufe).toBe(1);
    expect(screen.getByRole('button', { name: de.aktualisieren.laeuft })).toBeInTheDocument();
  });

  it('endet erst mit dem Endstatus des eigenen Laufs', async () => {
    falscheUhr();
    rendern(<Aktualisieren />);
    await waitFor(() => expect(laufAbrufe).toBe(1));

    await userEvent.click(screen.getByRole('button', { name: de.aktualisieren.knopf }));
    await waitFor(() => expect(screen.getByRole('button', { name: de.aktualisieren.laeuft })).toBeInTheDocument());

    // Erst der naechste Takt der Abfrage bringt den Endstatus. Ohne ihn bleibt der Knopf im Lauf.
    laufJetzt = laufAntwort(8, 'erfolg');
    await vi.advanceTimersByTimeAsync(ABFRAGETAKT_MS);
    await waitFor(() => expect(screen.getByRole('button', { name: de.aktualisieren.knopf })).toBeEnabled());
  });

  it('haengt sich bei 409 an den bereits laufenden Lauf, statt einen zweiten zu starten', async () => {
    refreshAntwort = BELEGT(9);
    nachDemStart = laufAntwort(9, 'laufend');

    rendern(<Aktualisieren />);
    await waitFor(() => expect(laufAbrufe).toBe(1));

    await userEvent.click(screen.getByRole('button', { name: de.aktualisieren.knopf }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: de.aktualisieren.laeuft })).toBeInTheDocument(),
    );
    expect(refreshAbrufe).toBe(1);
  });

  it('uebernimmt einen Lauf, der beim Laden schon unterwegs ist — den ersten aus npm start [ADR-039]', async () => {
    laufJetzt = laufAntwort(5, 'laufend');
    falscheUhr();

    rendern(<Aktualisieren />);
    await waitFor(() => expect(screen.getByRole('button', { name: de.aktualisieren.laeuft })).toBeInTheDocument());

    laufJetzt = laufAntwort(5, 'erfolg');
    await vi.advanceTimersByTimeAsync(ABFRAGETAKT_MS);
    await waitFor(() => expect(screen.getByRole('button', { name: de.aktualisieren.knopf })).toBeEnabled());
    expect(refreshAbrufe).toBe(0);
  });

  it('nennt den Schritt, den der Server meldet, im Knopf und in der Statusregion', async () => {
    nachDemStart = laufAntwort(8, 'laufend', 'kurse');
    falscheUhr();
    rendern(<Aktualisieren />);
    await waitFor(() => expect(laufAbrufe).toBe(1));

    await userEvent.click(screen.getByRole('button', { name: de.aktualisieren.knopf }));
    const kurse = de.aktualisieren.schritte.kurse;
    await waitFor(() =>
      expect(screen.getByRole('button', { name: de.aktualisieren.schritt(kurse) })).toBeDisabled(),
    );
    expect(screen.getByRole('status')).toHaveTextContent(de.aktualisieren.laeuftSchrittStatus(kurse));

    laufJetzt = laufAntwort(8, 'laufend', 'inflation');
    await vi.advanceTimersByTimeAsync(ABFRAGETAKT_MS);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: de.aktualisieren.schritt(de.aktualisieren.schritte.inflation) }),
      ).toBeInTheDocument(),
    );
  });

  it('rendert im Leerlauf nicht endlos, obwohl der Status nach oben in den State geht', async () => {
    // Bildet `Seite` in App.tsx nach: der gemeldete Status landet in einem useState. Ein
    // Effekt, der bei jedem Render neu feuert, setzt dort jedes Mal ein neues Objekt —
    // eine Schleife ohne Netz und ohne Eingabe, die einen CPU-Kern dauerhaft bindet.
    let renders = 0;
    function Halter() {
      const [, setStatus] = useState<McpAnmeldungStatus | null>(null);
      // Notbremse: ohne sie liefe eine echte Schleife bis zum Timeout und finge den Test ein.
      return <Aktualisieren onAnmeldungStatus={renders > 100 ? undefined : setStatus} />;
    }

    rendern(
      <Profiler
        id="halter"
        onRender={() => {
          renders += 1;
        }}
      >
        <Halter />
      </Profiler>,
    );
    await waitFor(() => expect(laufAbrufe).toBe(1));
    // Zeit fuer weitere Runden, falls es eine Schleife gibt.
    await new Promise((fertig) => setTimeout(fertig, 300));

    // Erwartet sind einige Renders fuer das Laden der Abfragen, nicht Hunderte.
    expect(renders).toBeLessThan(15);
  });
});

describe('Aktualisieren — Anmeldung am MCP [ADR-012]', () => {
  let aufraeumen: readonly (() => void)[] = [];
  let anmeldungAbrufe = 0;
  let laeuftJetzt = false;

  beforeEach(() => {
    anmeldungAbrufe = 0;
    laeuftJetzt = false;
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'portfolio-token');
    meta.setAttribute('content', 'test-token');
    document.head.append(meta);

    const anmeldung = () => ({ angemeldet: true, laeuft: laeuftJetzt, fehler: null, stand: null, drift: DRIFT });
    const zurueck = fetchErsatz((pfad, methode) => {
      if (pfad === '/api/mcp-anmeldung' && methode === 'POST') {
        laeuftJetzt = true;
        return { status: 202, body: anmeldung() };
      }
      if (pfad === '/api/mcp-anmeldung') {
        anmeldungAbrufe += 1;
        return { body: anmeldung() };
      }
      if (pfad === '/api/lauf') return { body: laufAntwort(7, 'erfolg') };
      return { status: 404, body: {} };
    });
    aufraeumen = [() => meta.remove(), zurueck];
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const schritt of aufraeumen) schritt();
  });

  it('fragt nach dem Start weiter nach, obwohl der Cache noch `laeuft: false` haelt', async () => {
    // Frueher schaltete der Effekt die Abfrage sofort wieder ab: im Cache stand noch die
    // Antwort von vor dem Klick, und die Oberflaeche erfuhr nie vom Ausgang.
    let status: McpAnmeldungStatus | null = null;
    falscheUhr();
    rendern(
      <Aktualisieren
        onAnmeldungStatus={(s) => {
          status = s;
        }}
      />,
    );
    await waitFor(() => expect(anmeldungAbrufe).toBe(1));

    (status as McpAnmeldungStatus | null)?.onAnmelden();

    await vi.advanceTimersByTimeAsync(ABFRAGETAKT_MS);
    await waitFor(() => expect(anmeldungAbrufe).toBeGreaterThanOrEqual(2));
    expect((status as McpAnmeldungStatus | null)?.laeuft).toBe(true);
  });
});
