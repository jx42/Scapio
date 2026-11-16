/**
 * Quelle `invesco:<isin>`: Bestandteile der Invesco-ETFs, als JSON von dng-api.invesco.com.
 *
 * Einen Katalog gibt es nicht; ob eine ISIN zu Invesco gehört, klärt `sucheInvesco` je ISIN.
 * produktId ist die ISIN selbst. `loadType=full` liefert seit November 406, `productType` 500 —
 * beide fehlen deshalb.
 */

import type { Bestandteil } from '../../core/lookthrough.ts';
import type { Isin } from '../../core/typen.ts';
import type { Anbieterernte, Katalogeintrag } from '../anbieter.ts';
import { pruefeGewichtsSumme } from '../anbieter.ts';
import { entschaerfe } from '../fremdtext.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { holeText } from '../netz.ts';
import { GRENZE, ISIN_MUSTER, pruefe } from '../schema.ts';
import { InvescoAntwort, InvescoShareclassAntwort } from '../schema/invesco.ts';

export const quelleFuer = (isin: Isin): string => `invesco:${isin}`;

const BASIS = 'https://dng-api.invesco.com/cache/v1/accounts/de_DE/shareclasses/';

const hole = (ctx: Kontext, adresse: string): Promise<string> =>
  holeText(adresse, {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/json',
  });

export async function sucheInvesco(ctx: Kontext, isin: Isin): Promise<Katalogeintrag | null> {
  const text = await hole(ctx, `${BASIS}${isin}?idType=isin`);
  const antwort = pruefe(`invesco:suche:${isin}`, InvescoShareclassAntwort, JSON.parse(text));
  if (!('aliases' in antwort) || antwort.aliases.isin !== isin) return null;
  return { produktId: isin };
}

export async function bestandteileInvesco(ctx: Kontext, isin: Isin): Promise<Ernte<Anbieterernte>> {
  const quelle = quelleFuer(isin);
  const text = await hole(ctx, `${BASIS}${isin}/holdings/index?idType=isin`);
  const antwort = pruefe(quelle, InvescoAntwort, JSON.parse(text));

  const teile: Bestandteil[] = [];
  const gesehen = new Set<string>();
  let summe = 0;
  let ohneIsin = 0;

  for (const zeile of antwort.holdings) {
    const unternehmen = (zeile.isin ?? '').toUpperCase();
    if (!ISIN_MUSTER.test(unternehmen)) {
      ohneIsin += 1;
      continue;
    }
    const gewicht = zeile.weight / 100;
    if (gesehen.has(unternehmen)) {
      const vorhanden = teile.findIndex((t) => t.unternehmenIsin === unternehmen);
      const alt = teile[vorhanden];
      if (alt !== undefined) teile[vorhanden] = { ...alt, gewicht: alt.gewicht + gewicht };
    } else {
      gesehen.add(unternehmen);
      teile.push({
        fondsIsin: isin,
        unternehmenIsin: unternehmen,
        name: entschaerfe(zeile.name).slice(0, GRENZE.name),
        gewicht,
        sektor: null,
        land: null,
      });
    }
    summe += gewicht;
  }

  if (teile.length === 0) throw new Error(`invesco ${isin}: Antwort gelesen, aber keine verwertbare Zeile.`);
  pruefeGewichtsSumme(ctx, quelle, { isin, summe, positionen: teile.length, ohneIsin });

  return {
    daten: { teile, gewichtsSumme: summe },
    quelle,
    rohJson: JSON.stringify({ stand: ctx.jetzt, teile }),
  };
}
