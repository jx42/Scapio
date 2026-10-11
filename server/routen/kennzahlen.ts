/**
 * Kachel 3: die Zahlen unter dem Verlauf. Der Server holt nur die Eingaben zusammen
 * und ruft `berechneKennzahlen` — eine einzige reine Funktion. [INV-04]
 *
 * XIRR und die reale Rendite behalten ihre `art`: sagt der Kern "kein
 * Vorzeichenwechsel", zeigt die Oberflaeche das statt einer erfundenen Null.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nurDieseParameter } from '../fehler.ts';
import {
  centAlsZahl,
  maxDrawdownAlsJson,
  maxDrawdownJsonSchema,
  objektSchema,
  sharpeAlsJson,
  sharpeJsonSchema,
  tagAlsText,
  umschlagAus,
  umschlagSchemaEigenschaften,
  volatilitaetAlsJson,
  volatilitaetJsonSchema,
  xirrAlsJson,
  xirrJsonSchema,
  zahlOderNull,
} from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import type { Kontext } from '../server.ts';
import type { ErtragsZeile, Hinweis, KennzahlenAntwort, RealisierteZeile } from '../vertrag.ts';

const ERTRAGS_ZEILE_SCHEMA = objektSchema<ErtragsZeile>({
  txId: { type: 'string' },
  tag: { type: 'string' },
  typ: { type: 'string' },
  isin: { type: ['string', 'null'] },
  name: { type: ['string', 'null'] },
  bezug: { type: 'string' },
  betragCent: { type: 'number' },
});

const REALISIERTE_ZEILE_SCHEMA = objektSchema<RealisierteZeile>({
  txId: { type: 'string' },
  tag: { type: 'string' },
  isin: { type: 'string' },
  name: { type: 'string' },
  gewinnCent: { type: 'number' },
});

const ANTWORT_SCHEMA = objektSchema<KennzahlenAntwort>({
  investiertCent: { type: 'number' },
  kursgewinnCent: { type: 'number' },
  kursgewinnProzent: { type: 'number' },
  realisiertCent: { type: 'number' },
  zinsenCent: { type: 'number' },
  steuernCent: { type: 'number' },
  gebuehrenCent: { type: 'number' },
  gesamtCent: { type: 'number' },
  twr: { type: ['number', 'null'] },
  twrProJahr: { type: ['number', 'null'] },
  twrGrob: { type: 'boolean' },
  xirr: xirrJsonSchema,
  inflation: { type: ['number', 'null'] },
  real: objektSchema<KennzahlenAntwort['real']>({
    exakt: xirrJsonSchema,
    fisher: { type: ['number', 'null'] },
    basisMonat: { type: 'string' },
    teuerungBisMonat: { type: ['string', 'null'] },
    fortgeschriebeneMonate: { type: 'array', items: { type: 'string' } },
    teuerungLaufendesJahr: { type: ['number', 'null'] },
  }),
  maxDrawdown: maxDrawdownJsonSchema,
  volatilitaetProJahr: volatilitaetJsonSchema,
  sharpe: sharpeJsonSchema,
  sparrateCent: { type: 'number' },
  sparrate12Cent: { type: 'number' },
  hinweise: {
    type: 'array',
    items: objektSchema<Hinweis>({ code: { type: 'string' }, text: { type: 'string' } }),
  },
  zinsenTransaktionen: { type: 'array', items: ERTRAGS_ZEILE_SCHEMA },
  steuernTransaktionen: { type: 'array', items: ERTRAGS_ZEILE_SCHEMA },
  gebuehrenTransaktionen: { type: 'array', items: ERTRAGS_ZEILE_SCHEMA },
  realisierteVerkaeufe: { type: 'array', items: REALISIERTE_ZEILE_SCHEMA },
  ...umschlagSchemaEigenschaften,
});

export function registriereKennzahlen(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/kennzahlen', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): KennzahlenAntwort => {
    nurDieseParameter(anfrage.query, []);
    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    const k = lm.kennzahlen();

    return {
      investiertCent: centAlsZahl(k.investiertCent),
      kursgewinnCent: centAlsZahl(k.kursgewinnCent),
      kursgewinnProzent: zahlOderNull(k.kursgewinnProzent) ?? 0,
      realisiertCent: centAlsZahl(k.realisiertCent),
      zinsenCent: centAlsZahl(k.zinsenCent),
      steuernCent: centAlsZahl(k.steuernCent),
      gebuehrenCent: centAlsZahl(k.gebuehrenCent),
      gesamtCent: centAlsZahl(k.gesamtCent),
      twr: zahlOderNull(k.twr.gesamt),
      twrProJahr: zahlOderNull(k.twr.proJahr),
      twrGrob: k.twr.grob,
      xirr: xirrAlsJson(k.xirr),
      /** Jahresteuerung zwischen erstem Fluss und letztem Monat mit echter VPI-Zahl. */
      inflation: zahlOderNull(k.real.teuerungProJahr),
      real: {
        exakt: xirrAlsJson(k.real.exakt),
        fisher: zahlOderNull(k.real.fisher),
        basisMonat: k.real.basisMonat,
        teuerungBisMonat: k.real.teuerungBisMonat,
        fortgeschriebeneMonate: k.real.fortgeschriebeneMonate,
        /** Nur Anzeige: der Durchschnitt der Monate des laufenden Jahres. */
        teuerungLaufendesJahr: zahlOderNull(k.real.teuerungLaufendesJahr),
      },
      maxDrawdown: maxDrawdownAlsJson(k.maxDrawdown),
      volatilitaetProJahr: volatilitaetAlsJson(k.volatilitaetProJahr),
      sharpe: sharpeAlsJson(k.sharpe),
      sparrateCent: centAlsZahl(k.sparrateCent),
      sparrate12Cent: centAlsZahl(k.sparrate12Cent),
      hinweise: k.hinweise.map((h) => ({ code: h.code, text: h.text })),
      zinsenTransaktionen: k.zinsenTransaktionen.map((z) => ({
        txId: z.txId,
        tag: tagAlsText(z.tag),
        typ: z.typ,
        isin: z.isin,
        name: z.name,
        bezug: z.bezug,
        betragCent: centAlsZahl(z.betragCent),
      })),
      steuernTransaktionen: k.steuernTransaktionen.map((z) => ({
        txId: z.txId,
        tag: tagAlsText(z.tag),
        typ: z.typ,
        isin: z.isin,
        name: z.name,
        bezug: z.bezug,
        betragCent: centAlsZahl(z.betragCent),
      })),
      gebuehrenTransaktionen: k.gebuehrenTransaktionen.map((z) => ({
        txId: z.txId,
        tag: tagAlsText(z.tag),
        typ: z.typ,
        isin: z.isin,
        name: z.name,
        bezug: z.bezug,
        betragCent: centAlsZahl(z.betragCent),
      })),
      realisierteVerkaeufe: k.realisierteVerkaeufe.map((z) => ({
        txId: z.txId,
        tag: tagAlsText(z.tag),
        isin: z.isin,
        name: z.name,
        gewinnCent: centAlsZahl(z.gewinnCent),
      })),
      ...umschlagAus(lm.stand(), lm.drift()),
    };
  });
}
