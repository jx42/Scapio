/**
 * Quelle `gesamtwert`: der Gesamtwert des Depots, wie die Bank ihn sieht.
 *
 * Dient der GEGENPROBE, nicht der Anzeige: zusammen mit `holdings` und `cash` ergibt er die
 * Summenprobe (Positionswerte + Kontostand = Gesamtwert). Eine Abweichung ist ein Hinweis,
 * nie ein Abbruch. Bis September 2026 kam der Wert aus `get_portfolio_performance`; die Bank
 * hat das Tool entfernt. [ADR-032]
 *
 * Nichts aus dieser Quelle wird gespeichert ausser der Rohantwort in `raw_snapshot`.
 */

import type { Cent } from '../../core/dezimal.ts';
import { mcpAufrufRoh } from '../mcp.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { OverviewAntwort, pruefe } from '../schema.ts';

export const QUELLE = 'gesamtwert';
const TOOL = 'get_portfolio_overview';

export type Gesamtwerternte = {
  /** Wertpapiere + Krypto + Kontostand laut Bank. */
  readonly gesamtCent: Cent;
  /**
   * Moment, fuer den dieser Gesamtwert gilt (`valuationTimestampUtc`). Die Bank rechnet ihn
   * nicht laufend neu; ohne diesen Stand liesse sich nicht sagen, ob eine Abweichung ein
   * Befund ist oder nur der Kursgang seither. [ADR-015]
   */
  readonly gesamtAus: string;
};

export async function holeGesamtwert(ctx: Kontext): Promise<Ernte<Gesamtwerternte>> {
  const roh = await mcpAufrufRoh(TOOL, {
    konfiguration: ctx.konfiguration,
    sicherung: ctx.mcp,
    melde: ctx.melde,
  });
  const antwort = pruefe(QUELLE, OverviewAntwort, roh.bloecke[0]);
  return {
    daten: { gesamtCent: antwort.valuation.total, gesamtAus: antwort.timestamps.valuationTimestampUtc },
    quelle: QUELLE,
    rohJson: roh.rohJson,
  };
}
