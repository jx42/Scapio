/**
 * Quelle `cash`: der Kontostand.
 *
 * `get_portfolio_holdings` liefert keinen Kontostand mehr (siehe `holdings.ts`) — dafuer
 * gibt es `get_portfolio_cash_breakdown`. Wir uebernehmen nur `cash.cashBalance`: das ist
 * der tatsaechliche Kontostand, den die Selbstkontrolle (§7.7) gegen den Rechenkern
 * vergleicht. `buyingPower`, `credit` und `derivatives` sind fuer diese Anwendung ohne
 * Belang und werden nicht ausgewertet.
 */

import type { Cent } from '../../core/dezimal.ts';
import { mcpAufrufRoh } from '../mcp.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { CashBreakdownAntwort, pruefe } from '../schema.ts';

export const QUELLE = 'cash';
const TOOL = 'mcp__claude_ai_Scalable_Capital__get_portfolio_cash_breakdown';

export async function holeCash(ctx: Kontext): Promise<Ernte<Cent>> {
  const roh = await mcpAufrufRoh(TOOL, {
    konfiguration: ctx.konfiguration,
    sicherung: ctx.mcp,
    melde: ctx.melde,
  });

  const antwort = pruefe(QUELLE, CashBreakdownAntwort, roh.bloecke[0]);

  return {
    daten: antwort.cash.cashBalance,
    quelle: QUELLE,
    rohJson: roh.rohJson,
  };
}
