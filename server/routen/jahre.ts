/**
 * Kachel 1, Tabellenansicht: je Kalenderjahr Rendite, Vergleich, Teuerung und Fluesse.
 * Gerechnet wird in `core/jahre.ts`; hier werden nur die Eingaben zusammengetragen.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { jahresuebersicht } from '../../core/jahre.ts';
import * as repository from '../../db/repository/index.ts';
import { LESENDE_ROUTEN } from '../../shared/routen.ts';
import { nurDieseParameter } from '../fehler.ts';
import { centAlsZahl, objektSchema, oderNull, tagAlsText, umschlagAus, umschlagSchemaEigenschaften, zahlOderNull } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import type { Kontext } from '../server.ts';
import { alsBenchmarkIsin, vergleichsdepot } from '../vergleichsdepot.ts';
import type { Jahre, Jahreszeile } from '../vertrag.ts';

const ANTWORT_SCHEMA = objektSchema<Jahre>({
  jahre: {
    type: 'array',
    items: objektSchema<Jahreszeile>({
      jahr: { type: 'string' },
      ab: { type: ['string', 'null'] },
      bis: { type: ['string', 'null'] },
      twr: { type: ['number', 'null'] },
      vergleich: { type: ['number', 'null'] },
      teuerung: { type: ['number', 'null'] },
      teuerungBisMonat: { type: ['string', 'null'] },
      real: { type: ['number', 'null'] },
      gewinnCent: { type: 'number' },
      einzahlungCent: { type: 'number' },
      endwertCent: { type: 'number' },
    }),
  },
  benchmark: oderNull(
    objektSchema<NonNullable<Jahre['benchmark']>>({
      isin: { type: 'string' },
      name: { type: 'string' },
    }),
  ),
  ...umschlagSchemaEigenschaften,
});

export function registriereJahre(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/jahre', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): Jahre => {
    const query = nurDieseParameter(anfrage.query, LESENDE_ROUTEN.jahre.parameter);
    const benchmarkIsin = alsBenchmarkIsin(query.benchmark);

    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    const reihe = lm.reihe();
    const umschlag = umschlagAus(lm.stand(), lm.drift());
    if (reihe.length === 0) return { jahre: [], benchmark: null, ...umschlag };

    const erster = reihe[0]!.tag;
    const letzter = reihe[reihe.length - 1]!.tag;
    const depot =
      benchmarkIsin === null
        ? null
        : vergleichsdepot(ctx.db, benchmarkIsin, lm.externeFluesse(), erster, letzter, erster, letzter);

    const jahre = jahresuebersicht({
      reihe,
      externe: lm.externeFluesse(),
      vergleichsreihe: depot?.reihe ?? null,
      vpi: repository.vpi.alsKarte(ctx.db),
    });

    return {
      jahre: jahre.map((j) => ({
        jahr: j.jahr,
        ab: j.ab === null ? null : tagAlsText(j.ab),
        bis: j.bis === null ? null : tagAlsText(j.bis),
        twr: zahlOderNull(j.twr),
        vergleich: zahlOderNull(j.vergleich),
        teuerung: zahlOderNull(j.teuerung),
        teuerungBisMonat: j.teuerungBisMonat,
        real: zahlOderNull(j.real),
        gewinnCent: centAlsZahl(j.gewinnCent),
        einzahlungCent: centAlsZahl(j.einzahlungCent),
        endwertCent: centAlsZahl(j.endwertCent),
      })),
      benchmark: depot?.info ?? null,
      ...umschlag,
    };
  });
}
