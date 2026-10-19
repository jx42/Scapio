/**
 * Quelle `holdings`: der aktuelle Bestand.
 *
 * Der Kontostand kommt NICHT von hier — `get_portfolio_holdings` liefert keinen `cash`,
 * dafuer gibt es die eigene Quelle `cash` (`ingest/quellen/cash.ts`).
 *
 * Diese Quelle liefert den Pruefstein der Selbstkontrolle (§7.7): was hier steht, ist der
 * Stand der Bank, und was der Rechenkern fuer heute ausrechnet, muss dazu passen. Deshalb
 * gilt hier die Abbruchzeile aus §6.4 — eine negative Menge oder ein Kurs <= 0 macht den
 * Vergleich sinnlos.
 *
 * Der aktuelle Kurs wird zusaetzlich als Kurspunkt fuer heute mit Herkunft `chart_1m`
 * uebernommen: er ist der frischeste Kurs, den wir haben, und ohne ihn haette der heutige
 * Tag im Raster eine Luecke, bis der naechste Chart-Abruf sie fuellt.
 */

import type { Kurspunkt } from '../../core/kursraster.ts';
import type { Bestand } from '../../core/typen.ts';
import { mcpAufrufRoh } from '../mcp.ts';
import { entschaerfe } from '../fremdtext.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { pruefeKurs, pruefeMenge } from '../plausibilitaet.ts';
import { GRENZE, HoldingsAntwort, pruefe } from '../schema.ts';

export const QUELLE = 'holdings';
const TOOL = 'get_portfolio_holdings';

export type Holdingsernte = {
  readonly bestaende: readonly Bestand[];
  readonly kurspunkte: readonly Kurspunkt[];
  /**
   * Zeitstempel des juengsten Kurses dieser Antwort, unveraendert aus `currentQuote`.
   * Die Summenprobe braucht ihn, um zu erkennen, ob der Gesamtwert der Bank denselben
   * Moment beschreibt wie die eigene Summe. [ADR-015]
   */
  readonly kurseAus: string | null;
};

export async function holeHoldings(ctx: Kontext): Promise<Ernte<Holdingsernte>> {
  const roh = await mcpAufrufRoh(TOOL, {
    konfiguration: ctx.konfiguration,
    sicherung: ctx.mcp,
    melde: ctx.melde,
  });

  const antwort = pruefe(QUELLE, HoldingsAntwort, roh.bloecke[0]);

  const bestaende: Bestand[] = [];
  const kurspunkte: Kurspunkt[] = [];
  let kurseAus: string | null = null;

  for (const p of antwort.holdings) {
    pruefeMenge(QUELLE, p.isin, p.position.filled); // Abbruch bei < 0
    pruefeKurs(QUELLE, p.isin, p.currentQuote.midPrice); // Abbruch bei <= 0

    bestaende.push({
      isin: p.isin,
      name: entschaerfe(p.name).slice(0, GRENZE.name), // Fremdtext. Speichern, nie auswerten. [INV-06]
      mengeE8: p.position.filled,
      kursE6: p.currentQuote.midPrice,
      stand: ctx.jetzt,
    });

    kurspunkte.push({
      isin: p.isin,
      tag: ctx.heute,
      kurs: p.currentQuote.midPrice,
      herkunft: 'chart_1m',
      abgerufenAm: ctx.jetzt,
    });

    kurseAus = juengerer(kurseAus, p.currentQuote.timestamp);
  }

  return {
    daten: { bestaende, kurspunkte, kurseAus },
    quelle: QUELLE,
    rohJson: roh.rohJson,
  };
}

/**
 * `Zeitstempel` ist im Schema nur eine begrenzte Zeichenkette — die Bank garantiert kein
 * Format. Deshalb wird nach Zeitpunkt verglichen, nicht nach Text; was sich nicht lesen
 * laesst, verdraengt einen lesbaren Stand nicht.
 */
function juengerer(bisher: string | null, kandidat: string): string | null {
  if (bisher === null) return Number.isNaN(Date.parse(kandidat)) ? null : kandidat;
  const a = Date.parse(bisher);
  const b = Date.parse(kandidat);
  if (Number.isNaN(b)) return bisher;
  if (Number.isNaN(a)) return kandidat;
  return b > a ? kandidat : bisher;
}
