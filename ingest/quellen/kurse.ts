/**
 * Quelle `kurse:<isin>`: die Kurshistorie je Wertpapier, aus vier Zeitfenstern.
 *
 * Warum vier Abrufe statt einem: `max` liefert ueber Jahre nur ein grobes Raster, `one_month`
 * liefert taegliche Werte. Beide zusammen ergeben eine Reihe, die weit zurueckreicht UND in
 * der juengsten Vergangenheit genau ist. Welcher Wert bei Ueberschneidung gewinnt, entscheidet
 * `verschmelzeKurse` in `core/kursraster.ts` ueber den Rang — nicht diese Datei. [P-02]
 *
 * Ein Fehler bei einer ISIN oder einem Fenster beendet weder die Quelle noch den Lauf:
 * fehlende Stuetzstellen ergeben eine Luecke im Raster, und eine Luecke ist sichtbar
 * (`depot_tag.lueckenhaft`). Ein Abbruch waere unsichtbar.
 */

import type { Isin } from '../../core/typen.ts';
import type { Herkunft, Kurspunkt } from '../../core/kursraster.ts';
import { tagAus } from '../../core/kalender.ts';
import { mcpAufrufRoh } from '../mcp.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { pruefeKurs, tagIstBrauchbar } from '../plausibilitaet.ts';
import type { Zeitfenster } from '../schema.ts';
import { ChartAntwort, pruefe } from '../schema.ts';

const TOOL = 'get_security_chart';

/** Fenster und die Herkunft, die daraus wird. Die Reihenfolge ist die des Rangs, aufsteigend. */
export const KURSFENSTER_JE_HERKUNFT: readonly (readonly [Zeitfenster, Herkunft])[] = [
  ['max', 'chart_max'],
  ['one_year', 'chart_1y'],
  ['three_months', 'chart_3m'],
  ['one_month', 'chart_1m'],
];

export const quelleFuer = (isin: Isin): string => `kurse:${isin}`;

export type Kursernte = {
  readonly kurspunkte: readonly Kurspunkt[];
  /** Fenster, die nicht geliefert haben. Leer heisst: alle da. */
  readonly fehlendeFenster: readonly string[];
};

export async function holeKurse(
  ctx: Kontext,
  isin: Isin,
): Promise<Ernte<Kursernte>> {
  const kurspunkte: Kurspunkt[] = [];
  const fehlend: string[] = [];
  const rohStuecke: Record<string, unknown> = {};

  for (const [fenster, herkunft] of KURSFENSTER_JE_HERKUNFT) {
    let bloecke: readonly unknown[];
    try {
      const roh = await mcpAufrufRoh(TOOL, {
        konfiguration: ctx.konfiguration,
        sicherung: ctx.mcp,
        ergaenzung: { isin, fenster },
        melde: ctx.melde,
      });
      bloecke = roh.bloecke;
    } catch (fehler) {
      // Ausgeloest: die uebrigen Fenster scheitern ebenso, ohne Netz — ein Fehler je ISIN genuegt.
      if (ctx.mcp?.ausgeloest === true) throw fehler;
      fehlend.push(fenster);
      ctx.befunde.hinweis('kursfensterNichtAbrufbar', { fenster, isin, grund: (fehler as Error).name });
      continue;
    }

    let antwort;
    try {
      antwort = pruefe(quelleFuer(isin), ChartAntwort, bloecke[0]);
    } catch {
      fehlend.push(fenster);
      ctx.befunde.hinweis('kursfensterSchema', { fenster, isin });
      continue;
    }

    if (antwort.isin !== isin) {
      // Eine Antwort ueber ein anderes Papier ist schlimmer als keine.
      fehlend.push(fenster);
      ctx.befunde.hinweis('kursfensterAndereIsin', { fenster, isin });
      continue;
    }

    rohStuecke[fenster] = bloecke[0];

    for (const p of antwort.dataPoints) {
      let tag;
      try {
        tag = tagAus(p.timestampUtc);
      } catch {
        continue; // ein einzelner unlesbarer Punkt ist kein Grund, das Fenster zu verwerfen
      }
      if (!tagIstBrauchbar(ctx.befunde, quelleFuer(isin), tag, ctx.heute)) continue;

      const kurs = p.midPrice;
      pruefeKurs(quelleFuer(isin), isin, kurs); // Abbruch bei <= 0

      kurspunkte.push({ isin, tag, kurs, herkunft, abgerufenAm: ctx.jetzt });
    }
  }

  return {
    daten: { kurspunkte, fehlendeFenster: fehlend },
    quelle: quelleFuer(isin),
    rohJson: JSON.stringify(rohStuecke),
  };
}
