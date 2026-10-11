/**
 * Kachel 1: Depotwert, eingezahltes Kapital und Kursgewinn ueber der Zeit.
 *
 * Hier wird nichts gerechnet — die Reihe liegt fertig in `depot_tag`, der Kursgewinn
 * je Tag und im Fenster kommt aus `core/kursgewinn.ts`. Das Fenster wird ueber
 * `core/kalender.ts` bestimmt, nie ueber Millisekunden. [INV-03] Siehe ADR-011 fuer die
 * Entscheidung, hier absoluten Kursgewinn statt des zeitgewichteten TWR zu zeigen.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { baueBenchmarkreihe, risikofreiesRaster } from '../../core/benchmark.ts';
import type { Tag } from '../../core/kalender.ts';
import { tageZwischen, vergleiche } from '../../core/kalender.ts';
import { kursgewinnFenster, vergleichImFenster } from '../../core/kursgewinn.ts';
import type { VergleichPunkt } from '../../core/kursgewinn.ts';
import { rasterFuer, verschmelzeKurse } from '../../core/kursraster.ts';
import * as repository from '../../db/repository/index.ts';
import { nurDieseParameter } from '../fehler.ts';
import { centAlsZahl, objektSchema, oderNull, tagAlsText, umschlagAus, umschlagSchemaEigenschaften } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import { markenAus } from '../marken.ts';
import { alsZeitraum, beginnVon, minusMonate } from '../zeitraum.ts';
import type { Kontext } from '../server.ts';
import { BENCHMARKS, RISIKOFREI, RISIKOFREI_ISIN } from '../vertrag.ts';
import type { Marke, MarkenVorgang, Zeitpunkt, Zeitreihe } from '../vertrag.ts';

/** Unbekannt oder fehlend wird still zu `null` — eine kaputte gespeicherte Auswahl im
 * localStorage soll die Kachel nicht sperren, anders als ein ungueltiger `zeitraum`. */
function alsBenchmarkIsin(wert: unknown): string | null {
  if (typeof wert !== 'string') return null;
  if (wert === RISIKOFREI_ISIN) return wert;
  return BENCHMARKS.some((b) => b.isin === wert) ? wert : null;
}

/**
 * Ueber drei Jahren reicht ein Punkt je Woche: taeglich waere „max“ ein Megabyte, das
 * die Oberflaeche ohnehin nicht aufloesen kann. Gezaehlt vom letzten Tag rueckwaerts,
 * damit er immer dabei ist; der erste Tag und jeder Tag mit Marke bleiben ebenfalls,
 * weil Linie und Tooltip die Marke ueber genau diesen Punkt finden.
 */
function bleibtImFenster(tag: Tag, von: Tag, letzter: Tag, markenTage: ReadonlySet<Tag>): boolean {
  return tag === von || markenTage.has(tag) || tageZwischen(tag, letzter) % 7 === 0;
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
  zeitraum: { type: 'string' },
  fensterGewinnCent: { type: 'number' },
  fensterGewinnProzent: { type: 'number' },
  benchmark: oderNull(
    objektSchema<NonNullable<Zeitreihe['benchmark']>>({
      isin: { type: 'string' },
      name: { type: 'string' },
    }),
  ),
  ...umschlagSchemaEigenschaften,
});

export function registriereZeitreihe(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/zeitreihe', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): Zeitreihe => {
    const query = nurDieseParameter(anfrage.query, ['zeitraum', 'benchmark']);
    const zeitraum = alsZeitraum(query.zeitraum);
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
        fensterGewinnCent: 0,
        fensterGewinnProzent: 0,
        benchmark: null,
        ...umschlag,
      };
    }

    const erster = reihe[0]!.tag;
    const letzter = reihe[reihe.length - 1]!.tag;
    const roh = beginnVon(zeitraum, lm.heute, erster);
    const von = vergleiche(roh, erster) < 0 ? erster : roh;

    const kursgewinnErgebnis = kursgewinnFenster(reihe, von, letzter);
    const kursgewinn = new Map(kursgewinnErgebnis.punkte.map((p) => [p.tag, p]));

    // Vergleichsdepot: dieselben externen Fluesse, am selben Tag in die gewaehlte
    // Benchmark-ISIN investiert statt ins echte Depot. Raster ueber die volle Historie
    // (`erster`..`letzter`), nicht nur das Fenster — `baueBenchmarkreihe` simuliert
    // selbst ab dem ersten Fluss und braucht dafuer Kurse vor `von`.
    let benchmarkInfo: { isin: string; name: string } | null = null;
    let vergleich: ReadonlyMap<string, VergleichPunkt> | null = null;
    if (benchmarkIsin === RISIKOFREI_ISIN) {
      benchmarkInfo = RISIKOFREI;
      const raster = risikofreiesRaster(repository.zins.alsKarte(ctx.db), erster, letzter);
      if (raster.size > 0) {
        const benchmarkReihe = baueBenchmarkreihe({ fluesse: lm.externeFluesse(), raster, von, bis: letzter });
        vergleich = new Map(vergleichImFenster(reihe, benchmarkReihe, von, letzter).map((p) => [p.tag, p]));
      }
    } else if (benchmarkIsin !== null) {
      const eintrag = BENCHMARKS.find((b) => b.isin === benchmarkIsin);
      if (eintrag !== undefined) {
        benchmarkInfo = eintrag;
        const kurspunkte = repository.kurs.fuerIsin(ctx.db, benchmarkIsin);
        if (kurspunkte.length > 0) {
          const raster = rasterFuer(verschmelzeKurse(kurspunkte), erster, letzter);
          const benchmarkReihe = baueBenchmarkreihe({ fluesse: lm.externeFluesse(), raster, von, bis: letzter });
          vergleich = new Map(vergleichImFenster(reihe, benchmarkReihe, von, letzter).map((p) => [p.tag, p]));
        }
      }
    }

    const marken = markenAus(lm.transaktionen(), von, letzter);
    const woechentlich = vergleiche(von, minusMonate(letzter, 36)) < 0;
    const markenTage = new Set(marken.map((m) => m.tag));

    let lueckenhaft = false;
    const punkte = [];
    for (const t of reihe) {
      if (vergleiche(t.tag, von) < 0 || vergleiche(t.tag, letzter) > 0) continue;
      if (t.lueckenhaft) lueckenhaft = true;
      if (woechentlich && !bleibtImFenster(t.tag, von, letzter, markenTage)) continue;
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
      fensterGewinnCent: centAlsZahl(kursgewinnErgebnis.fensterGewinnCent),
      fensterGewinnProzent: kursgewinnErgebnis.fensterGewinnProzent,
      benchmark: benchmarkInfo,
      ...umschlag,
    };
  });
}
