/**
 * Woher kommt der Gewinn: die Zerlegung kommt fertig aus `core/gewinnquellen.ts`, hier wird
 * nur uebersetzt.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Gewinnquelle as KernQuelle } from '../../core/gewinnquellen.ts';
import { nurDieseParameter } from '../fehler.ts';
import { centAlsZahl, objektSchema, umschlagAus, umschlagSchemaEigenschaften } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import type { Kontext } from '../server.ts';
import type { Gewinnquelle, Gewinnquellen } from '../vertrag.ts';

const QUELLE_SCHEMA = objektSchema<Gewinnquelle>({
  art: { type: 'string', enum: ['position', 'uebrige', 'ertraege', 'steuern', 'gebuehren'] },
  isin: { type: ['string', 'null'] },
  name: { type: ['string', 'null'] },
  anzahl: { type: 'integer' },
  betragCent: { type: 'number' },
  anteil: { type: 'number' },
});

const ANTWORT_SCHEMA = objektSchema<Gewinnquellen>({
  zufluesse: { type: 'array', items: QUELLE_SCHEMA },
  abfluesse: { type: 'array', items: QUELLE_SCHEMA },
  bruttoCent: { type: 'number' },
  abzuegeCent: { type: 'number' },
  nettoCent: { type: 'number' },
  mitteCent: { type: 'number' },
  nettoAnteil: { type: 'number' },
  ...umschlagSchemaEigenschaften,
});

function quelle(q: KernQuelle): Gewinnquelle {
  return {
    art: q.art,
    isin: q.isin,
    // Fremdtext. [INV-06]
    name: q.name,
    anzahl: q.anzahl,
    betragCent: centAlsZahl(q.betragCent),
    anteil: q.anteil,
  };
}

export function registriereGewinnquellen(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/gewinnquellen', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): Gewinnquellen => {
    nurDieseParameter(anfrage.query, []);
    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    const g = lm.kennzahlen().gewinnquellen;

    return {
      zufluesse: g.zufluesse.map(quelle),
      abfluesse: g.abfluesse.map(quelle),
      bruttoCent: centAlsZahl(g.bruttoCent),
      abzuegeCent: centAlsZahl(g.abzuegeCent),
      nettoCent: centAlsZahl(g.nettoCent),
      mitteCent: centAlsZahl(g.mitteCent),
      nettoAnteil: g.nettoAnteil,
      ...umschlagAus(lm.stand(), lm.drift()),
    };
  });
}
