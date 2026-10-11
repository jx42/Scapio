// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import { McpAnmeldungHinweise } from '@/components/McpAnmeldungHinweise';
import { rendern } from './hilfen';

const NICHTS = {
  noetig: false,
  erstmals: false,
  laeuft: false,
  erfolg: false,
  fehler: null,
  onAnmelden: () => {},
  onAktualisieren: () => {},
} as const;

describe('McpAnmeldungHinweise', () => {
  it('zeigt nichts, solange keine Anmeldung noetig ist, laeuft, erfolgreich war oder gescheitert ist', () => {
    const { container } = rendern(<McpAnmeldungHinweise {...NICHTS} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt den erklaerenden Satz mit einem Anmelden-Knopf, sobald eine Anmeldung noetig ist', async () => {
    const onAnmelden = vi.fn();
    rendern(<McpAnmeldungHinweise {...NICHTS} noetig={true} onAnmelden={onAnmelden} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(de.mcpAnmeldung.titel);
    expect(alert).toHaveTextContent(de.mcpAnmeldung.noetig);

    await userEvent.click(screen.getByRole('button', { name: de.mcpAnmeldung.anmeldenKnopf }));
    expect(onAnmelden).toHaveBeenCalledOnce();
  });

  it('zeigt den Browserhinweis als Alert, solange die Anmeldung laeuft', () => {
    rendern(<McpAnmeldungHinweise {...NICHTS} laeuft={true} />);
    expect(screen.getByRole('status')).toHaveTextContent(de.mcpAnmeldung.laeuftBeschreibung);
  });

  it('bestaetigt eine abgeschlossene Anmeldung mit einem Aktualisieren- und einem Schliessen-Knopf', async () => {
    const onAktualisieren = vi.fn();
    rendern(<McpAnmeldungHinweise {...NICHTS} erfolg={true} onAktualisieren={onAktualisieren} />);
    expect(screen.getByRole('status')).toHaveTextContent(de.mcpAnmeldung.erfolg);

    await userEvent.click(screen.getByRole('button', { name: de.aktualisieren.knopf }));
    expect(onAktualisieren).toHaveBeenCalledOnce();
    // Der Klick auf "Aktualisieren" blendet den Alert direkt mit aus.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('blendet die abgeschlossene Anmeldung ueber den Schliessen-Knopf aus, ohne zu aktualisieren', async () => {
    const onAktualisieren = vi.fn();
    rendern(<McpAnmeldungHinweise {...NICHTS} erfolg={true} onAktualisieren={onAktualisieren} />);

    await userEvent.click(screen.getByRole('button', { name: de.dialog.schliessen }));
    expect(onAktualisieren).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('zeigt vor der ersten Anmeldung einen ruhigen Satz statt eines Fehlers', () => {
    rendern(<McpAnmeldungHinweise {...NICHTS} noetig={true} erstmals={true} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(de.mcpAnmeldung.ersteAnmeldung);
    expect(screen.getByRole('button', { name: de.mcpAnmeldung.anmeldenKnopf })).toBeInTheDocument();
  });

  it('zeigt eine gescheiterte Anmeldung mit einem Anmelden-Knopf', async () => {
    const onAnmelden = vi.fn();
    rendern(
      <McpAnmeldungHinweise
        {...NICHTS}
        fehler={{ code: 'E_MCP_ANMELDUNG', text: 'Die Anmeldung wurde nicht abgeschlossen.' }}
        onAnmelden={onAnmelden}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(de.mcpAnmeldung.gescheitert('E_MCP_ANMELDUNG'));
    expect(screen.getByRole('alert')).toHaveTextContent('E_MCP_ANMELDUNG');

    await userEvent.click(screen.getByRole('button', { name: de.mcpAnmeldung.anmeldenKnopf }));
    expect(onAnmelden).toHaveBeenCalledOnce();
  });

  it('unterdrueckt den veralteten Noetig-Hinweis, sobald die Anmeldung abgeschlossen ist', () => {
    rendern(<McpAnmeldungHinweise {...NICHTS} noetig={true} erfolg={true} />);
    // Nur der Erfolgs-Alert steht — nicht mehr der widerspruechliche "noetig"-Hinweis.
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(de.mcpAnmeldung.erfolg);
  });

  it('unterdrueckt den veralteten Noetig-Hinweis, waehrend die Anmeldung laeuft', () => {
    rendern(<McpAnmeldungHinweise {...NICHTS} noetig={true} laeuft={true} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(de.mcpAnmeldung.laeuftBeschreibung);
  });
});
