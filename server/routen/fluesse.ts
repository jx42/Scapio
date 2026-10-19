/**
 * Kachel 5: Nettoinvestition in Wertpapiere je Monat, dazu Schnitt und Median.
 * Alles aus `core/fluesse.ts`, gespeist mit
 * `investitionsFluesse` statt `externeFluesse` (siehe ADR-008); das Fenster ist nur
 * eine Auswahl der letzten n Monate (oder aller); der Schnitt gilt genau fuer diese Monate.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { letzteMonate, schnittDerMonate } from '../../core/fluesse.ts';
import { FENSTER_MONATE } from '../../shared/zeitfenster.ts';
import { nurDieseParameter } from '../fehler.ts';
import { centAlsZahl, objektSchema, umschlagAus, umschlagSchemaEigenschaften } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import { alsFenster } from '../zeitraum.ts';
import { LESENDE_ROUTEN } from '../../shared/routen.ts';
import type { Kontext } from '../server.ts';
import type { Fluesse, Monatsfluss } from '../vertrag.ts';

const ANTWORT_SCHEMA = objektSchema<Fluesse>({
  monate: {
    type: 'array',
    items: objektSchema<Monatsfluss>({
      monat: { type: 'string' },
      nettoCent: { type: 'number' },
    }),
  },
  schnittCent: { type: 'number' },
  schnitt12Cent: { type: 'number' },
  medianCent: { type: 'number' },
  fenster: { type: 'string' },
  ...umschlagSchemaEigenschaften,
});

export function registriereFluesse(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/fluesse', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): Fluesse => {
    const query = nurDieseParameter(anfrage.query, LESENDE_ROUTEN.fluesse.parameter);
    const fenster = alsFenster(query.fenster);

    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    const u = lm.fluesse();
    const monate = fenster === 'max' ? u.monate : letzteMonate(u, FENSTER_MONATE[fenster]);

    return {
      monate: monate.map((m) => ({ monat: m.monat, nettoCent: centAlsZahl(m.zu - m.ab) })),
      schnittCent: centAlsZahl(schnittDerMonate(monate)),
      schnitt12Cent: centAlsZahl(u.schnitt12),
      medianCent: centAlsZahl(u.median),
      fenster,
      ...umschlagAus(lm.stand(), lm.drift()),
    };
  });
}
