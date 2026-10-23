/**
 * Rebalancing-Rechner im Dialog der Kachel Aufteilung. [ADR-057]
 *
 * Nur das Ziel kommt aus der Adresse; die Ist-Werte holt die Route selbst aus den
 * Kennzahlen, damit keine Eingabe die Depotwerte verfaelschen kann. Rein lesend, nichts
 * wird gespeichert — INV-08 bleibt unberuehrt.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Cent } from '../../core/dezimal.ts';
import { BP_GANZ, KONTO, rebalanciere } from '../../core/rebalancing.ts';
import type { Schluessel } from '../../core/rebalancing.ts';
import { nurDieseParameter, parameterAbgelehnt } from '../fehler.ts';
import { centAlsZahl, objektSchema, umschlagAus, umschlagSchemaEigenschaften, zahlOderNull } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import { LESENDE_ROUTEN } from '../../shared/routen.ts';
import type { Kontext } from '../server.ts';
import type { Rebalancing, RebalancingZeile } from '../vertrag.ts';

const ISIN_MUSTER = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const HOECHSTENS = 50;

const ANTWORT_SCHEMA = objektSchema<Rebalancing>({
  art: { type: 'string' },
  ohneVerkaeufe: { type: 'boolean' },
  zeilen: {
    type: 'array',
    items: objektSchema<RebalancingZeile>({
      schluessel: { type: 'string' },
      name: { type: ['string', 'null'] },
      imDepot: { type: 'boolean' },
      istCent: { type: 'number' },
      istAnteil: { type: 'number' },
      zielBp: { type: 'integer' },
      sollCent: { type: 'number' },
      deltaCent: { type: 'number' },
      danachCent: { type: 'number' },
      anteilDanach: { type: 'number' },
    }),
  },
  gesamtCent: { type: 'number' },
  abstandDanachCent: { type: 'number' },
  abstandDanach: { type: 'number' },
  ...umschlagSchemaEigenschaften,
});

/** `KONTO:0,IE00B4L5Y983:7000,…` — ganzzahlige Basispunkte, Summe genau 10 000. */
function alsZiel(wert: unknown): Map<Schluessel, number> {
  if (typeof wert !== 'string' || wert === '') throw parameterAbgelehnt('ziel');
  const eintraege = wert.split(',');
  if (eintraege.length > HOECHSTENS) throw parameterAbgelehnt('ziel');

  const ziel = new Map<Schluessel, number>();
  let summe = 0;
  for (const eintrag of eintraege) {
    const treffer = /^([A-Z0-9]+):(\d{1,5})$/.exec(eintrag);
    if (treffer === null) throw parameterAbgelehnt('ziel');
    const [, schluessel = '', bpText = ''] = treffer;
    const bp = Number(bpText);
    if (schluessel !== KONTO && !ISIN_MUSTER.test(schluessel)) throw parameterAbgelehnt('ziel');
    if (ziel.has(schluessel) || bp > BP_GANZ) throw parameterAbgelehnt('ziel');
    ziel.set(schluessel, bp);
    summe += bp;
  }
  if (summe !== BP_GANZ) throw parameterAbgelehnt('ziel');
  return ziel;
}

function alsOhneVerkaeufe(wert: unknown): boolean {
  if (wert === undefined || wert === '0') return false;
  if (wert === '1') return true;
  throw parameterAbgelehnt('ohneVerkaeufe');
}

export function registriereRebalancing(app: FastifyInstance, ctx: Kontext): void {
  app.get('/api/rebalancing', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (anfrage: FastifyRequest): Rebalancing => {
    const query = nurDieseParameter(anfrage.query, LESENDE_ROUTEN.rebalancing.parameter);
    const ziel = alsZiel(query.ziel);
    const ohneVerkaeufe = alsOhneVerkaeufe(query.ohneVerkaeufe);

    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    const k = lm.kennzahlen();
    // Nach einem ISIN-Wechsel fuehren die Kennzahlen nur noch die neue ISIN; ein Ziel fuer
    // die alte ist damit eine Position ausserhalb des Depots, wie in der Aufteilung.
    const ist = new Map<Schluessel, Cent>([[KONTO, k.cashCent], ...k.positionen.map((p) => [p.isin, p.wertCent] as const)]);
    const namen = new Map(k.positionen.map((p) => [p.isin, p.name]));

    const e = rebalanciere(ist, ziel, ohneVerkaeufe);
    if (e.art === 'zielUngueltig') throw parameterAbgelehnt('ziel');

    return {
      art: e.art,
      ohneVerkaeufe,
      zeilen: e.zeilen.map((z) => ({
        schluessel: z.schluessel,
        // Fremdtext. Nur Text. [INV-06]
        name: namen.get(z.schluessel) ?? null,
        imDepot: z.schluessel === KONTO || namen.has(z.schluessel),
        istCent: centAlsZahl(z.istCent),
        istAnteil: zahlOderNull(z.istAnteil) ?? 0,
        zielBp: z.zielBp,
        sollCent: centAlsZahl(z.sollCent),
        deltaCent: centAlsZahl(z.deltaCent),
        danachCent: centAlsZahl(z.danachCent),
        anteilDanach: zahlOderNull(z.anteilDanach) ?? 0,
      })),
      gesamtCent: centAlsZahl(e.gesamtCent),
      abstandDanachCent: centAlsZahl(e.abstandDanachCent),
      abstandDanach: zahlOderNull(e.abstandDanach) ?? 0,
      ...umschlagAus(lm.stand(), lm.drift()),
    };
  });
}
