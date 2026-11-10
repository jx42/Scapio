/**
 * Dialog der Aufteilung: Kursentwicklung aller aktuellen Positionen eines Fensters in einer
 * Antwort. Der Filter löst so keine Anfrage aus, und der Demo-Abzug bleibt aufzählbar (ADR-063).
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { spaeter, vergleiche } from '../../core/kalender.ts';
import { nurDieseParameter } from '../fehler.ts';
import { objektSchema, tagAlsText, umschlagAus, umschlagSchemaEigenschaften } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import { alsKursZeitraum, beginnVon, minusMonate } from '../zeitraum.ts';
import { LESENDE_ROUTEN } from '../../shared/routen.ts';
import { KURS_ZEITRAEUME } from '../../shared/zeitfenster.ts';
import type { Kontext } from '../server.ts';
import type { Positionsverlauf, PositionsverlaufKauf, PositionsverlaufLinie, PositionsverlaufPunkt } from '../vertrag.ts';

const ANTWORT_SCHEMA = objektSchema<Positionsverlauf>({
  linien: {
    type: 'array',
    items: objektSchema<PositionsverlaufLinie>({
      isin: { type: 'string' },
      name: { type: 'string' },
      kaeufe: {
        type: 'array',
        items: objektSchema<PositionsverlaufKauf>({ tag: { type: 'string' }, punktTag: { type: 'string' } }),
      },
    }),
  },
  punkte: {
    type: 'array',
    items: objektSchema<PositionsverlaufPunkt>({
      tag: { type: 'string' },
      werte: { type: 'object', additionalProperties: { type: ['number', 'null'] } },
    }),
  },
  zeitraeume: { type: 'array', items: { type: 'string' } },
  ...umschlagSchemaEigenschaften,
});

export function registrierePositionsverlauf(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/positionsverlauf', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): Positionsverlauf => {
    const query = nurDieseParameter(anfrage.query, LESENDE_ROUTEN.positionsverlauf.parameter);
    const zeitraum = alsKursZeitraum(query.zeitraum);

    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    const umschlag = umschlagAus(lm.stand(), lm.drift());
    const reihe = lm.reihe();
    const erster = reihe[0]?.tag;
    const letzter = reihe.at(-1)?.tag;
    if (erster === undefined || letzter === undefined) return { linien: [], punkte: [], zeitraeume: ['max'], ...umschlag };

    const von = spaeter(beginnVon(zeitraum, letzter, erster), erster);
    const ausduennen = vergleiche(von, minusMonate(letzter, 36)) < 0;
    const { linien, punkte } = lm.positionsverlauf(von, letzter, ausduennen);

    return {
      linien: linien.map((l) => ({
        isin: l.isin,
        // Fremdtext. Geht als Text über die Leitung und wird nie als Markup gerendert. [INV-06]
        name: l.name,
        kaeufe: l.kaeufe.map((k) => ({ tag: tagAlsText(k.tag), punktTag: tagAlsText(k.punktTag) })),
      })),
      punkte: punkte.map((p) => ({ tag: tagAlsText(p.tag), werte: p.werte })),
      zeitraeume: KURS_ZEITRAEUME.filter((z) => z === 'max' || vergleiche(beginnVon(z, letzter, erster), erster) > 0),
      ...umschlag,
    };
  });
}
