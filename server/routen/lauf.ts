/**
 * Fortschritt des letzten oder laufenden Laufs. Die Oberflaeche fragt diese Route nach
 * einem `POST /api/refresh` im Sekundentakt ab, bis der Lauf endet.
 *
 * Sie liest nur die `lauf`-Zeile — kein Schreiben, kein Zeitstempel. [INV-08]
 * `hinweise` und `fehlerText` stammen aus dem Ingest und enthalten laut
 * `db/repository/lauf.ts` keine Betraege; einziger Fremdtext ist der Wertpapiername beim
 * Tagessprung (`hinweise.ts`).
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nurDieseParameter } from '../fehler.ts';
import { objektSchema, oderNull, umschlagAus, umschlagSchemaEigenschaften } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import type { Kontext } from '../server.ts';
import type { Lauf } from '../vertrag.ts';

const ANTWORT_SCHEMA = objektSchema<Lauf>({
  laufId: { type: ['integer', 'null'] },
  status: { type: ['string', 'null'] },
  schritt: { type: ['string', 'null'] },
  quellen: { type: 'object', additionalProperties: { type: 'string' } },
  hinweise: {
    type: 'array',
    items: {
      type: 'object',
      properties: { art: { type: 'string' }, werte: { type: 'object', additionalProperties: true } },
      required: ['art', 'werte'],
    },
  },
  gestartet: { type: ['string', 'null'] },
  beendet: { type: ['string', 'null'] },
  fehler: oderNull(
    objektSchema<NonNullable<Lauf['fehler']>>({
      code: { type: 'string' },
      text: { type: ['string', 'null'] },
    }),
  ),
  ...umschlagSchemaEigenschaften,
});

export function registriereLauf(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/lauf', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): Lauf => {
    nurDieseParameter(anfrage.query, []);
    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    const lauf = lm.letzterLauf();

    if (lauf === null) {
      return {
        laufId: null,
        status: null,
        schritt: null,
        quellen: {},
        hinweise: [],
        gestartet: null,
        beendet: null,
        fehler: null,
        ...umschlagAus(lm.stand(), lm.drift()),
      };
    }

    return {
      laufId: lauf.id,
      status: lauf.status,
      schritt: lauf.schritt,
      quellen: lauf.quellen,
      hinweise: lauf.hinweise,
      gestartet: lauf.gestartet,
      beendet: lauf.beendet,
      fehler: lauf.fehlerCode === null ? null : { code: lauf.fehlerCode, text: lauf.fehlerText },
      ...umschlagAus(lm.stand(), lm.drift()),
    };
  });
}
