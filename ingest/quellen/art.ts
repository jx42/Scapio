/**
 * Quelle `art:<isin>`: die Wertpapierart (`STOCK`, `ETF`, ...) je gehaltener ISIN.
 *
 * Reine Anzeige — die Aufteilung zeigt sie, der Rechenkern benutzt sie nicht. Sie aendert sich nie, deshalb fragt der Lauf nur ISINs ab,
 * die `wertpapier_art` noch nicht kennt. Ein Fehlschlag laesst die Zeile offen und wird beim
 * naechsten Lauf wiederholt. [ADR-025]
 */

import type { Isin } from '../../core/typen.ts';
import type { Wertpapierart } from '../../db/repository/wertpapierArt.ts';
import { mcpAufrufRoh } from '../mcp.ts';
import type { Kontext } from '../importieren.ts';
import { pruefe, Wertpapierantwort } from '../schema.ts';

export const quelleFuer = (isin: Isin): string => `art:${isin}`;
const TOOL = 'mcp__claude_ai_Scalable_Capital__get_security_quote';

/** `null`, wenn die Bank keine Art kennt — dann gibt es nichts zu speichern. */
export async function holeArt(ctx: Kontext, isin: Isin): Promise<Wertpapierart | null> {
  const roh = await mcpAufrufRoh(TOOL, {
    konfiguration: ctx.konfiguration,
    sicherung: ctx.mcp,
    ergaenzung: { isin },
    melde: ctx.melde,
  });
  const antwort = pruefe(quelleFuer(isin), Wertpapierantwort, roh.bloecke[0]);
  const art = antwort.security.securityType;
  return art === null ? null : { isin, art: art.toUpperCase(), geprueftAm: ctx.heute };
}
