/**
 * Die laufenden Sparplaene und ihre Monatssumme. Reine Anzeige: diese Anwendung
 * beobachtet Sparplaene, sie legt keine an und entfernt keine. [CLAUDE.md]
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as repository from '../../db/repository/index.ts';
import { nurDieseParameter } from '../fehler.ts';
import { centAlsZahl, objektSchema, umschlagAus, umschlagSchemaEigenschaften } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import type { Kontext } from '../server.ts';
import type { Sparplaene, Sparplan } from '../vertrag.ts';

const ANTWORT_SCHEMA = objektSchema<Sparplaene>({
  plaene: {
    type: 'array',
    items: objektSchema<Sparplan>({
      isin: { type: 'string' },
      name: { type: 'string' },
      betragCent: { type: 'number' },
      frequenz: { type: 'string' },
      tagImMonat: { type: ['integer', 'null'] },
      naechste: { type: ['string', 'null'] },
    }),
  },
  summeCent: { type: 'number' },
  ...umschlagSchemaEigenschaften,
});

export function registriereSparplaene(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/sparplaene', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): Sparplaene => {
    nurDieseParameter(anfrage.query, []);
    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);

    return {
      plaene: lm.sparplaene().map((p) => ({
        isin: p.isin,
        // Fremdtext. [INV-06]
        name: p.name,
        betragCent: centAlsZahl(p.betragCent),
        frequenz: p.frequenz,
        tagImMonat: p.tagImMonat,
        naechste: p.naechsteAusfuehrung,
      })),
      summeCent: centAlsZahl(repository.sparplan.monatsSumme(ctx.db)),
      ...umschlagAus(lm.stand(), lm.drift()),
    };
  });
}
