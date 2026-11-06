/** Der interne Fehler protokolliert die Route, nie die Query: dort stehen ISINs und Zielanteile. */

import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registriereFehlerbehandlung } from '../../server/fehler.ts';

describe('Fehlerprotokoll', () => {
  it('nennt Route ohne Query-String', async () => {
    const zeilen: string[] = [];
    const stream = new Writable({
      write(stueck: Buffer, _kodierung, fertig) {
        zeilen.push(stueck.toString());
        fertig();
      },
    });
    const app = Fastify({ logger: { level: 'warn', stream } });
    registriereFehlerbehandlung(app);
    app.get('/api/rebalancing', () => {
      throw new Error('kaputt');
    });

    const res = await app.inject({ method: 'GET', url: '/api/rebalancing?ziel=IE00B4L5Y983%3A10000' });
    await app.close();

    expect(res.statusCode).toBe(500);
    const protokoll = zeilen.join('');
    expect(protokoll).toContain('"pfad":"/api/rebalancing"');
    expect(protokoll).not.toMatch(/IE00B4L5Y983|ziel=/);
  });
});
