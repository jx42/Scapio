/**
 * Vertragstest: prueft nicht Werte (das tun test/core und test/ui), sondern dass die
 * Feldmenge, die tatsaechlich ueber die Leitung geht, mit server/vertrag.ts
 * uebereinstimmt. `tsc` sieht das nicht — `schema.response` serialisiert ueber
 * fast-json-stringify und verschweigt jedes Feld, das im handgeschriebenen JSON-Schema
 * fehlt, ohne Fehler. Nur `app.inject()` gegen die echte Antwort deckt das auf.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { aufraeumen, eigeneHerkunft, testServer } from './hilfen.ts';

afterEach(() => {
  aufraeumen();
});

const UMSCHLAG = ['stand', 'drift'] as const;
const DRIFT = [
  'stufe',
  'abweichung',
  'cashAbweichung',
  'berechnetGesamtCent',
  'gemeldetGesamtCent',
  'grund',
  'positionen',
] as const;
const XIRR = ['art', 'rate'] as const;
const MAX_DRAWDOWN = ['art', 'anteil', 'tagHoch', 'tagTief'] as const;
const VOLATILITAET = ['art', 'proJahr', 'monate'] as const;
const SHARPE = ['art', 'wert', 'monate', 'zinsProJahr'] as const;
const REAL = [
  'exakt',
  'fisher',
  'basisMonat',
  'teuerungBisMonat',
  'fortgeschriebeneMonate',
  'teuerungLaufendesJahr',
] as const;

function schluessel(pfad: string, ist: unknown, soll: readonly string[]): void {
  expect(Object.keys(ist as object).sort(), pfad).toEqual([...soll].sort());
}

async function holen(app: FastifyInstance, pfad: string): Promise<Record<string, unknown>> {
  const antwort = await app.inject({ method: 'GET', url: pfad, headers: eigeneHerkunft() });
  expect(antwort.statusCode, pfad).toBe(200);
  return JSON.parse(antwort.body) as Record<string, unknown>;
}

describe('Vertragstest: server/vertrag.ts gegen die tatsaechliche Antwort', () => {
  it('GET /api/health', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/health');
    schluessel('health', body, ['ok', 'version', 'kernVersion', 'top25', 'lauf', ...UMSCHLAG]);
    expect(body.lauf).toBeNull();
    schluessel('health.drift', body.drift, DRIFT);
  });

  it('GET /api/aufteilung', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/aufteilung');
    schluessel('aufteilung', body, ['cashCent', 'cashAnteil', 'positionen', ...UMSCHLAG]);
    expect(body.positionen).toEqual([]);
    schluessel('aufteilung.drift', body.drift, DRIFT);
  });

  it('GET /api/fluesse', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/fluesse');
    schluessel('fluesse', body, ['monate', 'schnittCent', 'schnitt12Cent', 'medianCent', 'fenster', ...UMSCHLAG]);
    schluessel('fluesse.drift', body.drift, DRIFT);
  });

  it('GET /api/fluesse nimmt jedes Zeitfenster an', async () => {
    const { app } = await testServer();
    for (const fenster of ['3m', '6m', '12m', '36m', '60m', 'max']) {
      const body = await holen(app, `/api/fluesse?fenster=${fenster}`);
      expect(body.fenster).toBe(fenster);
    }
  });

  it('GET /api/kennzahlen', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/kennzahlen');
    schluessel('kennzahlen', body, [
      'investiertCent',
      'kursgewinnCent',
      'kursgewinnProzent',
      'realisiertCent',
      'zinsenCent',
      'steuernCent',
      'gebuehrenCent',
      'gesamtCent',
      'twr',
      'twrProJahr',
      'twrGrob',
      'xirr',
      'inflation',
      'real',
      'sparrateCent',
      'sparrate12Cent',
      'maxDrawdown',
      'volatilitaetProJahr',
      'sharpe',
      'hinweise',
      'zinsenTransaktionen',
      'steuernTransaktionen',
      'gebuehrenTransaktionen',
      'realisierteVerkaeufe',
      ...UMSCHLAG,
    ]);
    schluessel('kennzahlen.drift', body.drift, DRIFT);
    schluessel('kennzahlen.xirr', body.xirr, XIRR);
    schluessel('kennzahlen.real', body.real, REAL);
    schluessel('kennzahlen.real.exakt', (body.real as Record<string, unknown>).exakt, XIRR);
    schluessel('kennzahlen.maxDrawdown', body.maxDrawdown, MAX_DRAWDOWN);
    schluessel('kennzahlen.volatilitaetProJahr', body.volatilitaetProJahr, VOLATILITAET);
    schluessel('kennzahlen.sharpe', body.sharpe, SHARPE);
  });

  it('GET /api/lauf', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/lauf');
    schluessel('lauf', body, ['laufId', 'status', 'schritt', 'quellen', 'hinweise', 'gestartet', 'beendet', 'fehler', ...UMSCHLAG]);
    expect(body.fehler).toBeNull();
    schluessel('lauf.drift', body.drift, DRIFT);
  });

  it('GET /api/mcp-anmeldung', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/mcp-anmeldung');
    schluessel('mcp-anmeldung', body, ['angemeldet', 'laeuft', 'fehler', ...UMSCHLAG]);
    expect(body.fehler).toBeNull();
    schluessel('mcp-anmeldung.drift', body.drift, DRIFT);
  });

  it('GET /api/sparplaene', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/sparplaene');
    schluessel('sparplaene', body, ['plaene', 'summeCent', ...UMSCHLAG]);
    expect(body.plaene).toEqual([]);
    schluessel('sparplaene.drift', body.drift, DRIFT);
  });

  it('GET /api/top25', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/top25');
    schluessel('top25', body, [
      'zeilen',
      'topAnteil',
      'abdeckung',
      'durchschautCent',
      'anzahlUnternehmen',
      'fehlendeFonds',
      ...UMSCHLAG,
    ]);
    expect(body.zeilen).toEqual([]);
    schluessel('top25.drift', body.drift, DRIFT);
  });

  it('GET /api/zeitreihe', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/zeitreihe');
    schluessel('zeitreihe', body, [
      'punkte',
      'marken',
      'grob',
      'reiheLeer',
      'zeitraum',
      'fensterGewinnCent',
      'fensterGewinnProzent',
      'benchmark',
      ...UMSCHLAG,
    ]);
    schluessel('zeitreihe.drift', body.drift, DRIFT);
  });
});
