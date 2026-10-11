import type { Bestandteil } from '../../core/lookthrough.ts';
import type { Isin } from '../../core/typen.ts';
import type { Katalogeintrag } from '../anbieter.ts';
import { pruefeGewichtsSumme } from '../anbieter.ts';
import { entschaerfe } from '../fremdtext.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { holeText } from '../netz.ts';
import type { FondsXtrackers, Xtrackerstabelle, Xtrackerszeile } from '../schema.ts';
import { GRENZE, ISIN_MUSTER, XtrackersAntwort, XtrackersKatalogIsins, pruefe } from '../schema.ts';

export const quelleFuer = (isin: Isin): string => `xtrackers:${isin}`;

export type Xtrackersernte = { readonly teile: readonly Bestandteil[]; readonly gewichtsSumme: number };

/** Sucht die Spalte, deren Label (aus `columns`) auf `muster` passt — nie per Position. */
function spalte(tabelle: Xtrackerstabelle, muster: RegExp): string | undefined {
  return tabelle.columns.find((s) => muster.test(s.value))?.key;
}

function zellwert(zeile: Xtrackerszeile, schluessel: string | undefined): string | undefined {
  if (schluessel === undefined) return undefined;
  return zeile[schluessel]?.value;
}

export async function holeXtrackers(ctx: Kontext, fonds: FondsXtrackers): Promise<Ernte<Xtrackersernte>> {
  const quelle = quelleFuer(fonds.isin);
  const text = await holeText(`https://etf.dws.com/api/pdp/en-gb/etf/${fonds.isin}/holdings`, {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/json',
  });
  const antwort = pruefe(quelle, XtrackersAntwort, JSON.parse(text));
  const tabelle = antwort.tables[0];
  if (tabelle === undefined) throw new Error(`xtrackers ${fonds.isin}: Antwort ohne Tabelle.`);

  const isinSpalte = spalte(tabelle, /^isin$/i);
  const nameSpalte = spalte(tabelle, /^name$/i);
  const gewichtSpalte = spalte(tabelle, /weight/i);
  const landSpalte = spalte(tabelle, /country/i);
  const sektorSpalte = spalte(tabelle, /sector|industry/i);
  if (isinSpalte === undefined || nameSpalte === undefined || gewichtSpalte === undefined) {
    throw new Error(`xtrackers ${fonds.isin}: Spalten ISIN, Name oder Weight nicht gefunden.`);
  }

  const teile: Bestandteil[] = [];
  const gesehen = new Set<string>();
  let summe = 0;
  let ohneIsin = 0;
  for (const zeile of tabelle.values) {
    const isin = zellwert(zeile, isinSpalte)?.toUpperCase();
    if (isin === undefined || !ISIN_MUSTER.test(isin)) {
      ohneIsin += 1;
      continue;
    }
    const gewichtsZelle = zeile[gewichtSpalte];
    if (gewichtsZelle?.sortValue === undefined) {
      ohneIsin += 1;
      continue;
    }
    const gewicht = gewichtsZelle.sortValue / 100;
    if (gesehen.has(isin)) {
      const vorhanden = teile.findIndex((t) => t.unternehmenIsin === isin);
      const alt = teile[vorhanden];
      if (alt !== undefined) teile[vorhanden] = { ...alt, gewicht: alt.gewicht + gewicht };
    } else {
      gesehen.add(isin);
      const sektor = entschaerfe(zellwert(zeile, sektorSpalte) ?? '').slice(0, GRENZE.name);
      const land = entschaerfe(zellwert(zeile, landSpalte) ?? '').slice(0, GRENZE.name);
      teile.push({
        fondsIsin: fonds.isin,
        unternehmenIsin: isin,
        name: entschaerfe(zellwert(zeile, nameSpalte) ?? '').slice(0, GRENZE.name),
        gewicht,
        sektor: sektor.length > 0 ? sektor : null,
        land: land.length > 0 ? land : null,
      });
    }
    summe += gewicht;
  }
  if (teile.length === 0) throw new Error(`xtrackers ${fonds.isin}: Antwort gelesen, aber keine verwertbare Zeile.`);
  pruefeGewichtsSumme(ctx, quelle, { isin: fonds.isin, summe, positionen: teile.length, ohneIsin });
  return {
    daten: { teile, gewichtsSumme: summe },
    quelle,
    rohJson: JSON.stringify({ stand: ctx.jetzt, teile }),
  };
}

// ---------------------------------------------------------------------------
// Katalog: ISIN -> nichts weiter, die Bestandteile kommen ohnehin ueber die ISIN
// ---------------------------------------------------------------------------

const SITEMAP_ADRESSE = 'https://etf.dws.com/de-de/sitemap.xml';

/**
 * Jede Fondsseite traegt ihre ISIN im Pfad (`/de-de/<ISIN>-<slug>/`) — die Sitemap listet
 * sie alle in einem Abruf. Kein XML-Parser: nur die `<loc>`-Adressen, die auf dieses Muster
 * passen, werden gelesen, der Rest des Dokuments (andere Sprachvarianten, Nicht-Fondsseiten)
 * bleibt unangesehen. [INV-12] steht ueber der Obergrenze und der strengen `Isin` je Treffer
 * in `XtrackersKatalogIsins`.
 */
const EINTRAG_MUSTER = /<loc>https:\/\/etf\.dws\.com\/de-de\/([A-Z0-9]{12})-[a-z0-9-]+\/<\/loc>/g;

export async function katalogXtrackers(ctx: Kontext): Promise<ReadonlyMap<Isin, Katalogeintrag>> {
  const text = await holeText(SITEMAP_ADRESSE, {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1',
  });

  const gefunden: string[] = [];
  for (const treffer of text.matchAll(EINTRAG_MUSTER)) {
    const isin = treffer[1];
    if (isin !== undefined && ISIN_MUSTER.test(isin)) gefunden.push(isin);
  }
  const isins = pruefe('xtrackers:sitemap', XtrackersKatalogIsins, gefunden);

  const katalog = new Map<Isin, Katalogeintrag>();
  for (const isin of isins) katalog.set(isin, { produktId: isin });
  return katalog;
}
