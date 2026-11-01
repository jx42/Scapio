/**
 * Kachel 1: Depotwert, eingezahltes Kapital und Kursgewinn ueber der Zeit.
 *
 * Hier wird nichts gerechnet — die Reihe liegt fertig in `depot_tag`, der Kursgewinn
 * je Tag und im Fenster kommt aus `core/kursgewinn.ts`. Das Fenster wird ueber
 * `core/kalender.ts` bestimmt, nie ueber Millisekunden. [INV-03] Siehe ADR-011 fuer die
 * Entscheidung, hier absoluten Kursgewinn statt des zeitgewichteten TWR zu zeigen.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Tag } from '../../core/kalender.ts';
import { frueher, spaeter, tageZwischen, vergleiche } from '../../core/kalender.ts';
import { kursgewinnFenster, vergleichImFenster } from '../../core/kursgewinn.ts';
import type { VergleichPunkt } from '../../core/kursgewinn.ts';
import { nurDieseParameter, parameterAbgelehnt } from '../fehler.ts';
import { centAlsZahl, objektSchema, oderNull, tagAlsText, umschlagAus, umschlagSchemaEigenschaften } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import { markenAus } from '../marken.ts';
import { alsTagParameter, alsZeitraum, beginnVon, minusMonate } from '../zeitraum.ts';
import { LESENDE_ROUTEN } from '../../shared/routen.ts';
import { ZEITRAEUME } from '../../shared/zeitfenster.ts';
import type { Kontext } from '../server.ts';
import { alsBenchmarkIsin, vergleichsdepot } from '../vergleichsdepot.ts';
import { BENCHMARKS, RISIKOFREI } from '../vertrag.ts';
import type { Marke, MarkenVorgang, VergleichAbstand, Zeitpunkt, Zeitreihe } from '../vertrag.ts';

/**
 * Ueber drei Jahren reicht ein Punkt je Woche: taeglich waere „max“ ein Megabyte, das
 * die Oberflaeche ohnehin nicht aufloesen kann. Gezaehlt vom letzten Tag rueckwaerts,
 * damit er immer dabei ist; der erste Tag und jeder Tag mit Marke bleiben ebenfalls,
 * weil Linie und Tooltip die Marke ueber genau diesen Punkt finden.
 */
function bleibtImFenster(tag: Tag, von: Tag, bis: Tag, markenTage: ReadonlySet<Tag>): boolean {
  return tag === von || markenTage.has(tag) || tageZwischen(tag, bis) % 7 === 0;
}

const ANTWORT_SCHEMA = objektSchema<Zeitreihe>({
  punkte: {
    type: 'array',
    items: objektSchema<Zeitpunkt>(
      {
        tag: { type: 'string' },
        gesamtCent: { type: 'number' },
        einzahlungKumCent: { type: 'number' },
        gewinnCent: { type: 'number' },
        gewinnProzent: { type: 'number' },
        benchmarkCent: { type: 'number' },
        benchmarkGewinnCent: { type: 'number' },
        benchmarkProzent: { type: 'number' },
        differenzCent: { type: 'number' },
        differenzProzent: { type: 'number' },
      },
      {
        benchmarkCent: true,
        benchmarkGewinnCent: true,
        benchmarkProzent: true,
        differenzCent: true,
        differenzProzent: true,
      },
    ),
  },
  marken: {
    type: 'array',
    items: objektSchema<Marke>({
      tag: { type: 'string' },
      typ: { type: 'string' },
      vorgaenge: {
        type: 'array',
        items: objektSchema<MarkenVorgang>(
          {
            betragCent: { type: 'number' },
            isin: { type: 'string' },
            name: { type: 'string' },
          },
          { isin: true, name: true },
        ),
      },
    }),
  },
  grob: { type: 'boolean' },
  /**
   * Es gibt ueberhaupt keine Reihe — nicht bloss keine Punkte im gewaehlten Fenster.
   * Nur so kann die Kachel den echten Leerzustand (vor dem ersten Lauf) von einem
   * Fenster ohne Treffer unterscheiden und im zweiten Fall die Zeitraumwahl
   * stehenlassen, statt den Benutzer in einem Fenster einzusperren, aus dem er sich
   * nicht mehr herausklicken kann.
   */
  reiheLeer: { type: 'boolean' },
  zeitraum: { type: ['string', 'null'] },
  zeitraeume: { type: 'array', items: { type: 'string' } },
  ausschnitt: oderNull(
    objektSchema<NonNullable<Zeitreihe['ausschnitt']>>({
      von: { type: 'string' },
      bis: { type: 'string' },
    }),
  ),
  tage: { type: 'array', items: { type: 'string' } },
  fensterGewinnCent: { type: 'number' },
  fensterGewinnProzent: { type: 'number' },
  benchmark: oderNull(
    objektSchema<NonNullable<Zeitreihe['benchmark']>>({
      isin: { type: 'string' },
      name: { type: 'string' },
    }),
  ),
  abstaende: {
    type: 'array',
    items: objektSchema<VergleichAbstand>({
      isin: { type: 'string' },
      differenzCent: { type: 'number' },
      differenzProzent: { type: 'number' },
    }),
  },
  ...umschlagSchemaEigenschaften,
});

export function registriereZeitreihe(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/zeitreihe', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): Zeitreihe => {
    const query = nurDieseParameter(anfrage.query, LESENDE_ROUTEN.zeitreihe.parameter);
    // Frei gewaehlt (Zeitraumregler) oder ein fester Zeitraum — nie beides zugleich.
    const frei = query.von !== undefined || query.bis !== undefined;
    if (frei && query.zeitraum !== undefined) throw parameterAbgelehnt('zeitraum');
    const zeitraum = frei ? null : alsZeitraum(query.zeitraum);
    const freiVon = frei ? alsTagParameter(query.von, 'von') : null;
    const freiBis = frei ? alsTagParameter(query.bis, 'bis') : null;
    if (freiVon !== null && freiBis !== null && vergleiche(freiVon, freiBis) > 0) throw parameterAbgelehnt('von');
    const benchmarkIsin = alsBenchmarkIsin(query.benchmark);

    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    const reihe = lm.reihe();
    const umschlag = umschlagAus(lm.stand(), lm.drift());
    // Fondsnamen stehen nur in `bestand` — nur fuer aktuell gehaltene Positionen aufloesbar.
    const fondsName = new Map(lm.wertpapierBestand().map((b) => [b.isin, b.name]));

    if (reihe.length === 0) {
      return {
        punkte: [],
        marken: [],
        grob: false,
        reiheLeer: true,
        zeitraum,
        zeitraeume: ['max'],
        ausschnitt: null,
        tage: [],
        fensterGewinnCent: 0,
        fensterGewinnProzent: 0,
        benchmark: null,
        abstaende: [],
        ...umschlag,
      };
    }

    const erster = reihe[0]!.tag;
    const letzter = reihe[reihe.length - 1]!.tag;
    const von = spaeter(zeitraum === null ? freiVon! : beginnVon(zeitraum, lm.heute, erster), erster);
    const bis = freiBis === null ? letzter : frueher(freiBis, letzter);

    const kursgewinnErgebnis = kursgewinnFenster(reihe, von, bis);
    const kursgewinn = new Map(kursgewinnErgebnis.punkte.map((p) => [p.tag, p]));

    const depot = benchmarkIsin === null ? null : vergleichsdepot(ctx.db, benchmarkIsin, lm.externeFluesse(), erster, letzter, von, bis);
    const benchmarkInfo = depot?.info ?? null;
    const vergleich: ReadonlyMap<string, VergleichPunkt> | null =
      depot === null || depot.reihe === null
        ? null
        : new Map(vergleichImFenster(reihe, depot.reihe, von, bis).map((p) => [p.tag, p]));

    // Fuer die Benchmarkwahl: jeder Vergleich auf einen Blick, nicht erst nach dem Klick.
    const abstaende = [...BENCHMARKS, RISIKOFREI].flatMap((b): VergleichAbstand[] => {
      const anderes = b.isin === benchmarkIsin ? depot : vergleichsdepot(ctx.db, b.isin, lm.externeFluesse(), erster, letzter, von, bis);
      const ende = anderes === null || anderes.reihe === null ? undefined : vergleichImFenster(reihe, anderes.reihe, von, bis).at(-1);
      if (ende === undefined) return [];
      return [{ isin: b.isin, differenzCent: centAlsZahl(ende.differenzCent), differenzProzent: ende.differenzProzent }];
    });

    const marken = markenAus(lm.transaktionen(), von, bis);
    const woechentlich = vergleiche(von, minusMonate(bis, 36)) < 0;
    const markenTage = new Set(marken.map((m) => m.tag));

    let lueckenhaft = false;
    const punkte = [];
    for (const t of reihe) {
      if (vergleiche(t.tag, von) < 0 || vergleiche(t.tag, bis) > 0) continue;
      if (t.lueckenhaft) lueckenhaft = true;
      if (woechentlich && !bleibtImFenster(t.tag, von, bis, markenTage)) continue;
      const p = kursgewinn.get(t.tag)!;
      const v = vergleich?.get(t.tag);
      punkte.push({
        tag: tagAlsText(t.tag),
        gesamtCent: centAlsZahl(t.gesamtCent),
        einzahlungKumCent: centAlsZahl(t.nettoEinzahlungKumCent),
        gewinnCent: centAlsZahl(p.gewinnCent),
        gewinnProzent: p.gewinnProzent,
        ...(v === undefined
          ? {}
          : {
              benchmarkCent: centAlsZahl(v.wertCent),
              benchmarkGewinnCent: centAlsZahl(v.gewinnCent),
              benchmarkProzent: v.gewinnProzent,
              differenzCent: centAlsZahl(v.differenzCent),
              differenzProzent: v.differenzProzent,
            }),
      });
    }

    return {
      punkte,
      marken: marken.map((m) => ({
        tag: tagAlsText(m.tag),
        typ: m.typ,
        vorgaenge: m.vorgaenge.map((v) => ({
          betragCent: centAlsZahl(v.betragCent),
          isin: v.isin ?? undefined,
          name: v.isin === null ? undefined : fondsName.get(v.isin),
        })),
      })),
      // `grob` heisst: die Verkettung stuetzt sich auf ein Monatsraster oder es fehlen Kurse.
      grob: lm.twr().grob || lueckenhaft,
      reiheLeer: false,
      zeitraum,
      // Reicht die Historie nicht so weit zurueck, zeigte der Knopf dasselbe wie `max`.
      zeitraeume: ZEITRAEUME.filter((z) => z === 'max' || vergleiche(beginnVon(z, lm.heute, erster), erster) > 0),
      ausschnitt: { von: tagAlsText(von), bis: tagAlsText(bis) },
      tage: reihe.map((t) => tagAlsText(t.tag)),
      fensterGewinnCent: centAlsZahl(kursgewinnErgebnis.fensterGewinnCent),
      fensterGewinnProzent: kursgewinnErgebnis.fensterGewinnProzent,
      benchmark: benchmarkInfo,
      abstaende,
      ...umschlag,
    };
  });
}
