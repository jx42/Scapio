/**
 * Lebenszeichen und Kopfzeile der Oberflaeche: Version, Kernversion, Stand des letzten
 * erfolgreichen Laufs, Zustand des letzten Laufs. Nebenwirkungsfrei — diese Route
 * schreibt nichts, auch keinen Zeitstempel. [INV-08]
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { KERN_VERSION } from '../../core/version.ts';
import { nurDieseParameter } from '../fehler.ts';
import { objektSchema, oderNull, umschlagAus, umschlagSchemaEigenschaften } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import type { Kontext } from '../server.ts';
import type { Health } from '../vertrag.ts';

const ANTWORT_SCHEMA = objektSchema<Health>({
  ok: { type: 'boolean' },
  version: { type: 'string' },
  kernVersion: { type: 'integer' },
  top25: { type: 'boolean' },
  lauf: oderNull(
    objektSchema<NonNullable<Health['lauf']>>({
      id: { type: 'integer' },
      status: { type: 'string' },
      gestartet: { type: 'string' },
      beendet: { type: ['string', 'null'] },
    }),
  ),
  ...umschlagSchemaEigenschaften,
});

export function registriereHealth(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/health', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): Health => {
    nurDieseParameter(anfrage.query, []);
    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    const lauf = lm.letzterLauf();

    return {
      ok: true,
      version: ctx.version,
      kernVersion: KERN_VERSION,
      top25: ctx.konfiguration.top25,
      lauf:
        lauf === null
          ? null
          : { id: lauf.id, status: lauf.status, gestartet: lauf.gestartet, beendet: lauf.beendet },
      ...umschlagAus(lm.stand(), lm.drift()),
    };
  });
}
