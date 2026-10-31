/**
 * Reiter „Analyse“ der Aufteilung: der Blick durch die ETFs auf die Unternehmen dahinter.
 * `abdeckung` sagt, welcher Anteil des Depots ueberhaupt durchschaut werden konnte —
 * ohne diese Zahl waere die Liste eine Behauptung.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nurDieseParameter } from '../fehler.ts';
import { centAlsZahl, objektSchema, umschlagAus, umschlagSchemaEigenschaften, zahlOderNull } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import type { Kontext } from '../server.ts';
import type { Gruppe as KernGruppe } from '../../core/lookthrough.ts';
import type { FehlenderFonds, Fondsanteil, Gruppe, Top25, UnternehmenZeile } from '../vertrag.ts';

const GRUPPEN_SCHEMA = {
  type: 'array',
  items: objektSchema<Gruppe>({
    name: { type: ['string', 'null'] },
    exposureCent: { type: 'number' },
    anteil: { type: 'number' },
  }),
} as const;

const ANTWORT_SCHEMA = objektSchema<Top25>({
  zeilen: {
    type: 'array',
    items: objektSchema<UnternehmenZeile>({
      rang: { type: 'integer' },
      name: { type: 'string' },
      isin: { type: 'string' },
      exposureCent: { type: 'number' },
      anteilDepot: { type: 'number' },
      ausFonds: {
        type: 'array',
        items: objektSchema<Fondsanteil>(
          {
            isin: { type: 'string' },
            name: { type: 'string' },
            anteilCent: { type: 'number' },
          },
          { name: true },
        ),
      },
      sektor: { type: ['string', 'null'] },
      land: { type: ['string', 'null'] },
    }),
  },
  topAnteil: { type: 'number' },
  andereCent: { type: 'number' },
  andereAnteil: { type: 'number' },
  andereAnzahl: { type: 'integer' },
  abdeckung: { type: 'number' },
  durchschautCent: { type: 'number' },
  anzahlUnternehmen: { type: 'integer' },
  laender: GRUPPEN_SCHEMA,
  sektoren: GRUPPEN_SCHEMA,
  fehlendeFonds: {
    type: 'array',
    items: objektSchema<FehlenderFonds>({
      isin: { type: 'string' },
      name: { type: 'string' },
      anbieter: { type: 'string' },
      fall: { type: 'string' },
    }),
  },
  ...umschlagSchemaEigenschaften,
});

export function registriereTop25(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/top25', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): Top25 => {
    nurDieseParameter(anfrage.query, []);
    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    const d = lm.durchblick();
    // Fondsnamen stehen nicht in `etf_bestandteil` — nur in `bestand`, wo der Fonds als
    // gehaltene Position gefuehrt wird.
    const fondsName = new Map(lm.wertpapierBestand().map((b) => [b.isin, b.name]));

    return {
      zeilen: d.top.map((z, i) => ({
        rang: i + 1,
        // Fremdtext aus der iShares-CSV. Nur Text. [INV-06]
        name: z.name,
        isin: z.unternehmenIsin,
        exposureCent: centAlsZahl(z.exposure),
        anteilDepot: zahlOderNull(z.anteilDepot) ?? 0,
        ausFonds: z.ausFonds.map((f) => ({
          isin: f.isin,
          name: fondsName.get(f.isin),
          anteilCent: centAlsZahl(f.anteil),
        })),
        sektor: z.sektor,
        land: z.land,
      })),
      topAnteil: zahlOderNull(d.topAnteil) ?? 0,
      andereCent: centAlsZahl(d.andereCent),
      andereAnteil: zahlOderNull(d.andereAnteil) ?? 0,
      andereAnzahl: d.andereAnzahl,
      abdeckung: zahlOderNull(d.abdeckung) ?? 0,
      durchschautCent: centAlsZahl(d.durchschautCent),
      anzahlUnternehmen: d.anzahlUnternehmen,
      laender: d.laender.map(gruppe),
      sektoren: d.sektoren.map(gruppe),
      fehlendeFonds: lm.fehlendeFonds().map((f) => ({
        isin: f.isin,
        name: f.name,
        anbieter: f.anbieter,
        fall: f.fall,
      })),
      ...umschlagAus(lm.stand(), lm.drift()),
    };
  });
}

function gruppe(g: KernGruppe): Gruppe {
  // Fremdtext des Anbieters. Nur Text. [INV-06]
  return { name: g.name, exposureCent: centAlsZahl(g.exposure), anteil: zahlOderNull(g.anteil) ?? 0 };
}
