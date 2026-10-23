/**
 * Der Demo-Abzug [ADR-048]: Jede lesende Route hat ihren Platz darin, jede Anfrage der
 * Oberfläche beantwortet der echte Server, und der Worker liefert nichts außer dem Abzug.
 */

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { tagAus } from '../../core/kalender.ts';
import { testDatenbank } from '../../db/verbindung.ts';
import worker from '../../demo-worker/index.ts';
import { KOPFZEILEN, UNVERAENDERLICH } from '../../server/kopfzeilen.ts';
import { baueServer } from '../../server/server.ts';
import { abzugAnfragen, abzugPfad } from '../../shared/demoAbzug.ts';
import { aufraeumen, eigeneNavigation, konfiguration } from '../api/hilfen.ts';
import { seedeDatenbank } from '../e2e/seed.ts';
import { registrierteRouten } from '../invarianten/quellen.ts';

function abbilden(url: string): string | null {
  const adresse = new URL(url, 'http://demo');
  return abzugPfad(adresse.pathname, adresse.searchParams);
}

describe('Demo-Abzug — Abbildung', () => {
  it('deckt jede lesende API-Route ab', () => {
    const lesend = registrierteRouten()
      .filter((r) => r.methode === 'get' && r.pfad.startsWith('/api/'))
      .map((r) => r.pfad);
    const exportiert = new Set(abzugAnfragen().map((u) => new URL(u, 'http://demo').pathname));
    expect(lesend.length).toBeGreaterThan(5);
    expect(lesend.filter((p) => !exportiert.has(p))).toEqual([]);
  });

  it('bildet jede Anfrage auf einen eigenen Pfad ab', () => {
    const pfade = abzugAnfragen().map(abbilden);
    expect(pfade).not.toContain(null);
    expect(new Set(pfade).size).toBe(pfade.length);
  });

  it('folgt den Vorgaben des Servers', () => {
    expect(abbilden('/api/zeitreihe')).toBe('/api/zeitreihe/max/ohne.json');
    expect(abbilden('/api/zeitreihe?zeitraum=1j&benchmark=XX0000000000')).toBe('/api/zeitreihe/1j/ohne.json');
    expect(abbilden('/api/fluesse')).toBe('/api/fluesse/12m.json');
  });

  it.each([
    '/api/kennzahlen?x=1',
    '/api/zeitreihe?zeitraum=1j&zeitraum=3j',
    '/api/zeitreihe?zeitraum=../../index',
    '/api/zeitreihe?zeitraum=1j&benchmark=a&benchmark=b',
    '/api/zeitreihe?fenster=12m',
    '/api/fluesse?fenster=7m',
    '/api/rebalancing',
    '/api/rebalancing?ziel=KONTO:10000',
    '/api/rebalancing?ziel=KONTO:10000&ohneVerkaeufe=2',
    '/api/refresh',
    '/api/unbekannt',
    '/index.html',
  ])('lehnt %s ab', (url) => {
    expect(abbilden(url)).toBeNull();
  });
});

describe('Demo-Abzug — Antworten des Servers', () => {
  let app: FastifyInstance;
  let freigeben: () => void;

  beforeAll(async () => {
    const db = await testDatenbank();
    const jetzt = new Date().toISOString();
    const { heute } = seedeDatenbank(db, tagAus(jetzt), jetzt);
    const server = baueServer({
      db,
      konfiguration: konfiguration(),
      distPfad: join(tmpdir(), 'portfolio-kein-dist'),
      demoModus: true,
      heute,
      protokoll: false,
    });
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

  it('beantwortet jede Anfrage des Abzugs mit 200', async () => {
    const fehlgeschlagen: string[] = [];
    for (const url of abzugAnfragen()) {
      const antwort = await app.inject({ method: 'GET', url, headers: eigeneNavigation() });
      if (antwort.statusCode !== 200) fehlgeschlagen.push(`${url} → ${String(antwort.statusCode)}`);
    }
    expect(fehlgeschlagen).toEqual([]);
  });

  it('antwortet auf einen unbekannten Benchmark wie ohne Benchmark', async () => {
    const ohne = await app.inject({ method: 'GET', url: '/api/zeitreihe?zeitraum=1j', headers: eigeneNavigation() });
    const fremd = await app.inject({
      method: 'GET',
      url: '/api/zeitreihe?zeitraum=1j&benchmark=XX0000000000',
      headers: eigeneNavigation(),
    });
    expect(fremd.body).toBe(ohne.body);
  });
});

describe('Demo-Abzug — Worker', () => {
  const abgerufen: string[] = [];
  const umgebung = {
    ASSETS: {
      fetch(anfrage: Request | string): Promise<Response> {
        const url = typeof anfrage === 'string' ? anfrage : anfrage.url;
        abgerufen.push(new URL(url).pathname);
        return Promise.resolve(new Response('{}', { status: 200 }));
      },
    },
  };

  it('lehnt jede schreibende Methode mit 405 ab', async () => {
    for (const methode of ['POST', 'PUT', 'DELETE']) {
      const antwort = await worker.fetch(new Request('https://demo.test/api/refresh', { method: methode }), umgebung);
      expect(antwort.status).toBe(405);
      expect(antwort.headers.get('Content-Security-Policy')).not.toBeNull();
    }
  });

  it('holt eine API-Antwort aus dem Abzug, mit den Kopfzeilen des Servers', async () => {
    abgerufen.length = 0;
    const antwort = await worker.fetch(new Request('https://demo.test/api/fluesse?fenster=3m'), umgebung);
    expect(abgerufen).toEqual(['/api/fluesse/3m.json']);
    for (const [name, wert] of KOPFZEILEN) expect(antwort.headers.get(name)).toBe(wert);
  });

  it('beantwortet eine unbekannte API-Anfrage mit 404, ohne den Abzug zu fragen', async () => {
    abgerufen.length = 0;
    const antwort = await worker.fetch(new Request('https://demo.test/api/kennzahlen?x=1'), umgebung);
    expect(antwort.status).toBe(404);
    expect(abgerufen).toEqual([]);
  });

  it('cacht nur inhaltsadressierte Assets', async () => {
    const asset = await worker.fetch(new Request('https://demo.test/assets/index-AbCd1234.js'), umgebung);
    expect(asset.headers.get('Cache-Control')).toBe(UNVERAENDERLICH);
    const seite = await worker.fetch(new Request('https://demo.test/'), umgebung);
    expect(seite.headers.get('Cache-Control')).toBe('no-store');
  });
});
