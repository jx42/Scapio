/**
 * Gemeinsamer Rahmen der Tests unter `test/ingest/quellen/`, je Quelle eine Datei. Sie pruefen
 * die Quellen in `ingest/quellen/` — nicht ihre Schemata (siehe `schema.test.ts`)
 * und nicht ihre Pruefliste (siehe `plausibilitaet.test.ts`), sondern die VERDRAHTUNG:
 * dass jede Quelle die richtige geprueften Felder in ihre eigene Ernte uebertraegt, dass
 * ein Schema- oder Plausibilitaetsfehler tatsaechlich durchschlaegt, und die Kontrollfluss-
 * Eigenheiten, die keiner anderen Datei gehoeren — `holeKurse`s Fenster-fuer-Fenster-
 * Isolation, `holeIshares`s positionelle Zeilen und ISIN-Zusammenfassung, `holeVpi`s
 * Quellen-Sperre und Mehrdeutigkeitspruefung, `holeTransaktionen`s Vorzeichen und
 * Seed-Zusammenfuehrung.
 *
 * `mcpAufrufRoh` und `holeText` werden in jeder Datei gemockt (`vi.mock` wirkt nur dort, wo es
 * steht); die Griffe darauf liefert diese Datei. Geprueft wird, was eine Quelle aus
 * einer Antwort MACHT, nicht ob das MCP oder das Netz erreichbar ist (dafuer stehen
 * `mcp.test.ts` und `netz.test.ts`).
 */

import { vi } from 'vitest';
import type { Tag } from '../../../core/kalender.ts';
import { konfigurationFuer, type Konfiguration } from '../../../shared/konfiguration.ts';
import { Befunde } from '../../../ingest/plausibilitaet.ts';
import type { Kontext } from '../../../ingest/importieren.ts';
import { mcpAufrufRoh } from '../../../ingest/mcp.ts';
import { holeText } from '../../../ingest/netz.ts';

export const EM = 'IE00BKM4GZ66';
export const SYNTHETISCHER_GLOBALFONDS = 'ZZ0000000001';
export const SYNTHETISCHER_ZUKUNFTSFONDS = 'ZZ0000000002';
export const HEUTE = '2026-08-26' as Tag;
export const JETZT = '2026-08-26T18:00:00+02:00';

export const mcp = vi.mocked(mcpAufrufRoh);
export const netz = vi.mocked(holeText);

export function konfiguration(teil: Partial<Konfiguration> = {}): Konfiguration {
  return konfigurationFuer('/tmp/nicht-verwendet', {
    port: 4732,
    erlaubteHosts: ['www.ishares.com', 'etf.dws.com', 'www.amundietf.de', 'ec.europa.eu', 'data-api.ecb.europa.eu'],
    ...teil,
  });
}

export function kontext(teil: Partial<Kontext> = {}): Kontext {
  return {
    konfiguration: konfiguration(),
    heute: HEUTE,
    jetzt: JETZT,
    befunde: new Befunde(),
    ...teil,
  };
}

/** Eine `McpAntwort`, wie `mcpAufrufRoh` sie liefert — ein Block je Seite. */
export function antwort(...bloecke: unknown[]): { bloecke: unknown[]; rohJson: string } {
  return { bloecke, rohJson: JSON.stringify(bloecke) };
}

/** Eine gueltige, aber leere Kurs-Antwort — Fuellwert fuer Fenster, die im Test keine Rolle spielen. */
export function leeresFenster(isin: string, fenster: string | undefined) {
  return {
    isin,
    timeframe: fenster,
    currency: 'EUR',
    source: 'ubs',
    closingReferencePoint: { timestampUtc: '2026-01-01T00:00:00+01:00', midPrice: 100 },
    dataPoints: [],
  };
}
