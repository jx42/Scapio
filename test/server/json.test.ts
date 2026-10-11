/** fast-json-stringify verschweigt jedes Feld, das im Schema fehlt — hier muss jede Variante unversehrt ankommen. */

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  maxDrawdownJsonSchema,
  sharpeJsonSchema,
  volatilitaetJsonSchema,
  xirrJsonSchema,
  type MaxDrawdownJson,
  type SharpeJson,
  type VolatilitaetJson,
  type XirrJson,
} from '../../server/json.ts';

async function ueberDieLeitung(schema: object, wert: object): Promise<unknown> {
  const app = Fastify();
  app.get('/', { schema: { response: { 200: schema } } }, () => wert);
  const antwort = await app.inject({ method: 'GET', url: '/' });
  await app.close();
  return JSON.parse(antwort.body);
}

const faelle: readonly (readonly [string, object, object])[] = [
  ['xirr ok', xirrJsonSchema, { art: 'ok', rate: 0.07, mehrdeutig: true } satisfies XirrJson],
  ['xirr ohne Zahl', xirrJsonSchema, { art: 'nicht_bestimmbar', rate: null } satisfies XirrJson],
  ['maxDrawdown ok', maxDrawdownJsonSchema, { art: 'ok', anteil: 0.2, tagHoch: '2024-01-02', tagTief: '2024-03-04' } satisfies MaxDrawdownJson],
  ['volatilitaet ok', volatilitaetJsonSchema, { art: 'ok', proJahr: 0.15, monate: 24 } satisfies VolatilitaetJson],
  ['sharpe ok', sharpeJsonSchema, { art: 'ok', wert: 0.8, monate: 24, zinsProJahr: 0.02 } satisfies SharpeJson],
];

describe('Kennzahlen-Schemata', () => {
  it.each(faelle)('%s kommt vollstaendig an', async (_name, schema, wert) => {
    expect(await ueberDieLeitung(schema, wert)).toEqual(wert);
  });
});
