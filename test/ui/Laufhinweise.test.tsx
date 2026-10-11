// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import { de } from '@/i18n/de';
import { Laufhinweise } from '@/components/Laufhinweise';
import type { LaufHinweis } from '@/lib/api';
import { rendern } from './hilfen';

const ERSTER: LaufHinweis = { art: 'storniert', werte: { anzahl: 1 } };
const ZWEITER: LaufHinweis = { art: 'seedUebernommen', werte: { zeilen: 2 } };

afterEach(() => {
  window.localStorage.clear();
});

describe('Laufhinweise', () => {
  it('zeigt nichts, solange der letzte Lauf keine Hinweise gemeldet hat', () => {
    const { container } = rendern(
      <Laufhinweise laufId={1} hinweise={[]} quellen={{}} fehler={null} onAktualisieren={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt jeden Hinweis als eigenen Alert ueber die gesamte Breite', () => {
    rendern(
      <Laufhinweise
        laufId={1}
        hinweise={[{ art: 'summenAbweichung', werte: { zehnerpotenz: 2 } }]}
        quellen={{}}
        fehler={null}
        onAktualisieren={() => {}}
      />,
    );
    const alert = screen.getByRole('status');
    expect(alert).toHaveTextContent(de.laufhinweise.artTitel.summenAbweichung!);
    expect(alert).toHaveTextContent(de.laufhinweise.artTun.summenAbweichung!);
    expect(alert).toHaveTextContent('Positionswerte + Verrechnungskonto weichen um mehr als 1 € vom Gesamtwert ab (Größenordnung 10^2 €).');
  });

  it('zeigt Hinweise aus der Zeit vor den Arten unveraendert', () => {
    rendern(
      <Laufhinweise
        laufId={1}
        hinweise={[{ art: 'text', werte: { text: 'Alter Satz.' } }]}
        quellen={{}}
        fehler={null}
        onAktualisieren={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Alter Satz.');
  });

  it('zeigt mehrere Hinweise als mehrere Alerts', () => {
    rendern(
      <Laufhinweise laufId={1} hinweise={[ERSTER, ZWEITER]} quellen={{}} fehler={null} onAktualisieren={() => {}} />,
    );
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('zeigt den gescheiterten Bestand auch aus einem Lauf ohne Code je Quelle, mit Aktualisieren-Knopf', () => {
    const onAktualisieren = vi.fn();
    rendern(
      <Laufhinweise
        laufId={1}
        hinweise={[]}
        quellen={{ holdings: 'fehler' }}
        fehler={null}
        onAktualisieren={onAktualisieren}
      />,
    );
    const alert = screen.getByRole('status');
    expect(alert).toHaveTextContent(de.laufhinweise.quelle.holdings.titel);
    expect(alert).toHaveTextContent(de.laufhinweise.erneutVersuchen);

    fireEvent.click(screen.getByRole('button', { name: de.aktualisieren.knopf }));
    expect(onAktualisieren).toHaveBeenCalledOnce();
  });

  it('zeigt den gescheiterten Kontostand auch aus einem Lauf ohne Code je Quelle', () => {
    rendern(
      <Laufhinweise laufId={1} hinweise={[]} quellen={{ cash: 'fehler' }} fehler={null} onAktualisieren={() => {}} />,
    );
    const alert = screen.getByRole('status');
    expect(alert).toHaveTextContent(de.laufhinweise.quelle.cash.titel);
    expect(alert).toHaveTextContent(de.laufhinweise.erneutVersuchen);
    expect(screen.getByRole('button', { name: de.aktualisieren.knopf })).toBeInTheDocument();
  });

  it('zeigt zu jedem Hinweis die Abhilfe seiner Art', () => {
    rendern(
      <Laufhinweise
        laufId={1}
        hinweise={[
          {
            art: 'tagessprung',
            werte: { isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World', anzahl: 1, von: '2020-03-12', bis: '2020-03-12' },
          },
          ERSTER,
        ]}
        quellen={{}}
        fehler={null}
        onAktualisieren={() => {}}
      />,
    );
    const [sprung, anderer] = screen.getAllByRole('status');
    expect(sprung).toHaveTextContent('iShares Core MSCI World (IE00B4L5Y983): 1 Kurs mit Tagessprung über 30 % am 12.03.2020');
    expect(sprung).toHaveTextContent(de.laufhinweise.artTun.tagessprung!);
    expect(anderer).not.toHaveTextContent(de.laufhinweise.artTun.tagessprung!);
  });

  it('blendet einen Hinweis ueber den X-Knopf aus und merkt sich das fuer diesen Lauf', () => {
    const erster = de.laufhinweise.art.storniert('1');
    const zweiter = de.laufhinweise.art.seedUebernommen('2');
    const { unmount } = rendern(
      <Laufhinweise laufId={7} hinweise={[ERSTER, ZWEITER]} quellen={{}} fehler={null} onAktualisieren={() => {}} />,
    );
    const [ersterKnopf] = screen.getAllByRole('button', { name: de.laufhinweise.ausblenden });
    fireEvent.click(ersterKnopf!);
    expect(screen.queryByText(erster)).not.toBeInTheDocument();
    expect(screen.getByText(zweiter)).toBeInTheDocument();
    unmount();

    // Nach dem Neuladen bleibt er weg — beim naechsten Lauf ist er wieder da.
    const zweimal = rendern(
      <Laufhinweise laufId={7} hinweise={[ERSTER, ZWEITER]} quellen={{}} fehler={null} onAktualisieren={() => {}} />,
    );
    expect(screen.queryByText(erster)).not.toBeInTheDocument();
    zweimal.unmount();
    rendern(
      <Laufhinweise laufId={8} hinweise={[ERSTER, ZWEITER]} quellen={{}} fehler={null} onAktualisieren={() => {}} />,
    );
    expect(screen.getByText(erster)).toBeInTheDocument();
  });

  it('fasst gescheiterte Quellen je Art zusammen, mit Ursache, Folge, Abhilfe und Code', () => {
    const onAktualisieren = vi.fn();
    rendern(
      <Laufhinweise
        laufId={1}
        hinweise={[
          { art: 'quelleGescheitert', werte: { quelle: 'gesamtwert', code: 'E_MCP_ABGELEHNT' } },
          { art: 'quelleGescheitert', werte: { quelle: 'kurse:IE00B4L5Y983', code: 'E_MCP_DROSSEL' } },
          { art: 'quelleGescheitert', werte: { quelle: 'kurse:IE00BKM4GZ66', code: 'E_MCP_DROSSEL' } },
        ]}
        quellen={{ gesamtwert: 'fehler', 'kurse:IE00B4L5Y983': 'fehler', 'kurse:IE00BKM4GZ66': 'fehler' }}
        fehler={null}
        onAktualisieren={onAktualisieren}
      />,
    );
    const [gegenprobe, kurse] = screen.getAllByRole('status');
    expect(gegenprobe).toHaveTextContent(de.laufhinweise.quelle.gesamtwert.titel);
    expect(gegenprobe).toHaveTextContent(de.laufhinweise.quelleCode.E_MCP_ABGELEHNT.grund);
    expect(gegenprobe).toHaveTextContent(de.laufhinweise.quelle.gesamtwert.folge);
    expect(gegenprobe).toHaveTextContent(de.laufhinweise.quelleCode.E_MCP_ABGELEHNT.tun);
    expect(gegenprobe).toHaveTextContent(de.laufhinweise.code('E_MCP_ABGELEHNT'));
    expect(kurse).toHaveTextContent(de.laufhinweise.quelle.kurse.folge(2));
    expect(kurse).toHaveTextContent(de.laufhinweise.quelleCode.E_MCP_DROSSEL.tun);

    fireEvent.click(screen.getAllByRole('button', { name: de.aktualisieren.knopf })[0]!);
    expect(onAktualisieren).toHaveBeenCalledOnce();
  });

  it('bietet bei einer geaenderten Schnittstelle keinen Aktualisieren-Knopf an', () => {
    rendern(
      <Laufhinweise
        laufId={1}
        hinweise={[{ art: 'quelleGescheitert', werte: { quelle: 'sparplaene', code: 'E_SCHEMA' } }]}
        quellen={{ sparplaene: 'fehler' }}
        fehler={null}
        onAktualisieren={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(de.laufhinweise.quelleCode.schnittstelle.tun);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('zeigt gescheiterte Transaktionen nur einmal: als gescheiterten Lauf', () => {
    rendern(
      <Laufhinweise
        laufId={1}
        hinweise={[{ art: 'quelleGescheitert', werte: { quelle: 'transaktionen', code: 'E_SCHEMA' } }]}
        quellen={{ transaktionen: 'fehler' }}
        fehler={{ code: 'E_SCHEMA', text: null }}
        onAktualisieren={() => {}}
      />,
    );
    const [lauf, ...rest] = screen.getAllByRole('status');
    expect(rest).toHaveLength(0);
    expect(lauf).toHaveTextContent(de.laufhinweise.fehlerFolge);
    expect(lauf).toHaveTextContent(de.laufhinweise.code('E_SCHEMA'));
  });

  it('meldet eine gescheiterte Fondsaufloesung mit eigener Folge', () => {
    rendern(
      <Laufhinweise
        laufId={1}
        hinweise={[{ art: 'quelleGescheitert', werte: { quelle: 'fondsaufloesung', code: 'E_UNBEKANNT' } }]}
        quellen={{ fondsaufloesung: 'fehler' }}
        fehler={null}
        onAktualisieren={() => {}}
      />,
    );
    const alert = screen.getByRole('status');
    expect(alert).toHaveTextContent(de.laufhinweise.quelle.fondsaufloesung.titel);
    expect(alert).toHaveTextContent(de.laufhinweise.quelle.fondsaufloesung.folge);
  });

  it('ueberlaesst eine abgelaufene Anmeldung dem Anmelde-Alert', () => {
    const { container } = rendern(
      <Laufhinweise
        laufId={1}
        hinweise={[{ art: 'quelleGescheitert', werte: { quelle: 'sparplaene', code: 'E_MCP_ANMELDUNG' } }]}
        quellen={{ sparplaene: 'fehler' }}
        fehler={null}
        onAktualisieren={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt einen gescheiterten Lauf mit Satz, Code und — wo es hilft — Aktualisieren-Knopf', () => {
    rendern(
      <Laufhinweise
        laufId={1}
        hinweise={[]}
        quellen={{}}
        fehler={{ code: 'E_MCP_DROSSEL', text: null }}
        onAktualisieren={() => {}}
      />,
    );
    const alert = screen.getByRole('status');
    expect(alert).toHaveTextContent(de.laufhinweise.fehlerTitel);
    expect(alert).toHaveTextContent(de.laufFehler.E_MCP_DROSSEL!);
    expect(alert).toHaveTextContent(de.laufhinweise.code('E_MCP_DROSSEL'));
    expect(screen.getByRole('button', { name: de.aktualisieren.knopf })).toBeInTheDocument();
  });

  it('zeigt bei einem unbekannten Code den allgemeinen Satz und keinen Knopf', () => {
    rendern(
      <Laufhinweise laufId={1} hinweise={[]} quellen={{}} fehler={{ code: 'E_NEU', text: null }} onAktualisieren={() => {}} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(de.laufFehler.sonst);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
