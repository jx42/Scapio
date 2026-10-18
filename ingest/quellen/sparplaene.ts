/**
 * Quelle `sparplaene`: die laufenden Sparplaene.
 *
 * Reine Anzeige — die Kachel zeigt sie, der Rechenkern benutzt sie nicht. Deshalb ist der
 * Ausfall dieser Quelle harmlos: `sparplan` bleibt stehen, wie sie war, und die Kachel
 * zeigt ihr altes Standdatum. [P-08]
 *
 * `betragCent` ist ein Geldbetrag und geht durch `zuCent`; `tagImMonat` und die naechste
 * Ausfuehrung sind Anzeigewerte. Der Name ist Fremdtext. [INV-06]
 */

import type { Sparplan } from '../../db/repository/sparplan.ts';
import { mcpAufrufRoh } from '../mcp.ts';
import { entschaerfe } from '../fremdtext.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { GRENZE, pruefe, SparplaeneAntwort } from '../schema.ts';

export const QUELLE = 'sparplaene';
const TOOL = 'list_savings_plans';

export async function holeSparplaene(ctx: Kontext): Promise<Ernte<readonly Sparplan[]>> {
  const roh = await mcpAufrufRoh(TOOL, {
    konfiguration: ctx.konfiguration,
    sicherung: ctx.mcp,
    melde: ctx.melde,
  });

  const antwort = pruefe(QUELLE, SparplaeneAntwort, roh.bloecke[0]);

  const plaene: Sparplan[] = antwort.items.map((p) => ({
    isin: p.instrument.identifier,
    name: entschaerfe(p.instrument.name).slice(0, GRENZE.name),
    betragCent: p.amount,
    frequenz: p.configuration.frequency.toUpperCase(),
    tagImMonat: p.configuration.dayOfMonth,
    naechsteAusfuehrung: p.configuration.nextExecutionDate,
    stand: ctx.jetzt,
  }));

  return { daten: plaene, quelle: QUELLE, rohJson: roh.rohJson };
}
