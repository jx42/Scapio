/**
 * /api/rebalancing: Parameterpruefung und die Ist-Werte aus den Kennzahlen, auf dem
 * synthetischen Szenario des Durchstichs. [ADR-057]
 */

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { tagAus } from '../../core/kalender.ts';
import { testDatenbank } from '../../db/verbindung.ts';
import { baueServer } from '../../server/server.ts';
import type { Aufteilung, Rebalancing } from '../../server/vertrag.ts';
import { aufraeumen, eigeneHerkunft, konfiguration } from '../api/hilfen.ts';
import { seedeDatenbank } from '../e2e/seed.ts';

let app: FastifyInstance;
let freigeben: () => void;

beforeAll(async () => {
  const db = await testDatenbank();
  const jetzt = new Date().toISOString();
  const { heute } = seedeDatenbank(db, tagAus(jetzt), jetzt);
  const server = baueServer({ db, konfiguration: konfiguration(), distPfad: join(tmpdir(), 'portfolio-kein-dist'), heute, protokoll: false });
  app = server.app;
  freigeben = () => {
    server.sperre.gibFrei();
    db.close();
  };
});

afterAll(async () => {
  await app.close();
  freigeben();
  aufraeumen();
});

async function holen(query: string) {
  return app.inject({ method: 'GET', url: `/api/rebalancing?${query}`, headers: eigeneHerkunft() });
}

async function rebalancing(query: string): Promise<Rebalancing> {
  const antwort = await holen(query);
  expect(antwort.statusCode).toBe(200);
  return JSON.parse(antwort.body) as Rebalancing;
}

describe('/api/rebalancing', () => {
  it('nimmt die Ist-Werte aus der Aufteilung und trifft Σ Betrag zum Ziel = 0', async () => {
    const auf = JSON.parse((await app.inject({ method: 'GET', url: '/api/aufteilung', headers: eigeneHerkunft() })).body) as Aufteilung;
    const erste = auf.positionen[0]!;
    const r = await rebalancing(`ziel=KONTO:0,${erste.isin}:10000`);

    expect(r.art).toBe('ok');
    expect(r.zeilen[0]!.schluessel).toBe('KONTO');
    expect(r.zeilen[0]!.istCent).toBe(auf.cashCent);
    expect(r.zeilen.find((z) => z.schluessel === erste.isin)?.istCent).toBe(erste.wertCent);
    expect(r.zeilen.reduce((s, z) => s + z.deltaCent, 0)).toBe(0);
    expect(r.zeilen.filter((z) => z.schluessel !== erste.isin).every((z) => z.danachCent === 0)).toBe(true);
  });

  it('fuehrt eine Ziel-ISIN ausserhalb des Depots ohne Namen', async () => {
    const r = await rebalancing('ziel=KONTO:9000,XX0000000000:1000');
    const fremd = r.zeilen.find((z) => z.schluessel === 'XX0000000000');
    expect(fremd).toMatchObject({ imDepot: false, name: null, istCent: 0 });
  });

  it('verkauft ohne Verkaeufe nichts', async () => {
    const r = await rebalancing('ziel=KONTO:10000&ohneVerkaeufe=1');
    expect(r.ohneVerkaeufe).toBe(true);
    expect(r.zeilen.every((z) => z.deltaCent === 0)).toBe(true);
  });

  it.each([
    '',
    'ziel=',
    'ziel=KONTO:9999',
    'ziel=KONTO:5000,KONTO:5000',
    'ziel=KONTO:10001',
    'ziel=konto:10000',
    'ziel=IE00B4L5Y98:10000',
    'ziel=KONTO:10000.0',
    'ziel=KONTO:-1,IE00B4L5Y983:10001',
    `ziel=${Array.from({ length: 51 }, (_, i) => `XX${String(i).padStart(9, '0')}0:${i === 0 ? 10000 : 0}`).join(',')}`,
    'ziel=KONTO:10000&ohneVerkaeufe=ja',
    'ziel=KONTO:10000&ohneVerkaeufe=1&ohneVerkaeufe=1',
    'ziel=KONTO:10000&ziel=KONTO:10000',
    'ziel=KONTO:10000&x=1',
  ])('lehnt „%s“ mit E_PARAMETER ab', async (query) => {
    const antwort = await holen(query);
    expect(antwort.statusCode).toBe(400);
    expect((JSON.parse(antwort.body) as { fehler: { code: string } }).fehler.code).toBe('E_PARAMETER');
  });
});
