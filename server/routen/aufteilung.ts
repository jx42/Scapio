/**
 * Kachel 2: Aufteilung nach Position, mit Einstand, Buchgewinn und Positions-XIRR.
 * Die Positionen kommen fertig aus `core/kennzahlen.ts`; hier wird nur uebersetzt.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nurDieseParameter } from '../fehler.ts';
import {
  centAlsZahl,
  objektSchema,
  umschlagAus,
  umschlagSchemaEigenschaften,
  xirrAlsJson,
  xirrJsonSchema,
  zahlOderNull,
} from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import type { Kontext } from '../server.ts';
import type { Aufteilung, PositionZeile } from '../vertrag.ts';

const ANTWORT_SCHEMA = objektSchema<Aufteilung>({
  positionen: {
    type: 'array',
    items: objektSchema<PositionZeile>({
      isin: { type: 'string' },
      name: { type: 'string' },
      art: { type: ['string', 'null'] },
      wertCent: { type: 'number' },
      anteil: { type: 'number' },
      investiertCent: { type: 'number' },
      gewinnCent: { type: 'number' },
      gewinnProzent: { type: 'number' },
      realisiertCent: { type: 'number' },
      xirr: xirrJsonSchema,
    }),
  },
  cashCent: { type: 'number' },
  cashAnteil: { type: 'number' },
  ...umschlagSchemaEigenschaften,
});

export function registriereAufteilung(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/aufteilung', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): Aufteilung => {
    nurDieseParameter(anfrage.query, []);
    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    const k = lm.kennzahlen();
    const arten = lm.arten();

    return {
      positionen: k.positionen.map((p) => ({
        isin: p.isin,
        // Fremdtext. Geht als Text ueber die Leitung und wird nie als Markup gerendert. [INV-06]
        name: p.name,
        art: arten.get(p.isin) ?? null,
        wertCent: centAlsZahl(p.wertCent),
        anteil: zahlOderNull(p.anteil) ?? 0,
        investiertCent: centAlsZahl(p.investiertCent),
        gewinnCent: centAlsZahl(p.gewinnCent),
        gewinnProzent: zahlOderNull(p.gewinnProzent) ?? 0,
        realisiertCent: centAlsZahl(p.realisiertCent),
        xirr: xirrAlsJson(p.xirr),
      })),
      cashCent: centAlsZahl(k.cashCent),
      cashAnteil: zahlOderNull(k.cashAnteil) ?? 0,
      ...umschlagAus(lm.stand(), lm.drift()),
    };
  });
}
