/**
 * Vertragstest: prueft nicht Werte (das tun test/core und test/ui), sondern dass die
 * Feldmenge, die tatsaechlich ueber die Leitung geht, mit server/vertrag.ts
 * uebereinstimmt. `tsc` sieht das nicht — `schema.response` serialisiert ueber
 * fast-json-stringify und verschweigt jedes Feld, das im handgeschriebenen JSON-Schema
 * fehlt, ohne Fehler. Nur `app.inject()` gegen die echte Antwort deckt das auf.
 */

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { tagAus } from '../../core/kalender.ts';
import { testDatenbank } from '../../db/verbindung.ts';
import { baueServer } from '../../server/server.ts';
import type {
  Aufteilung,
  Drift,
  Fluesse,
  Health,
  Jahre,
  Jahreszeile,
  KennzahlenAntwort,
  Lauf,
  MaxDrawdownErgebnis,
  McpAnmeldung,
  Rebalancing,
  RebalancingZeile,
  SharpeErgebnis,
  Sparplaene,
  Top25,
  VolatilitaetErgebnis,
  XirrErgebnis,
  Zeitreihe,
} from '../../server/vertrag.ts';
import { seedeDatenbank } from '../e2e/seed.ts';
import { aufraeumen, eigeneHerkunft, konfiguration, testServer } from './hilfen.ts';

afterEach(() => {
  aufraeumen();
});

/**
 * Die Felder eines Vertragstyps. Die Liste ist an den Typ gebunden: ein Feld, das in
 * server/vertrag.ts dazukommt oder wegfaellt, macht schon `tsc` rot, nicht erst den Lauf.
 */
const felder = <T extends object>(f: {
  readonly [K in keyof Required<T>]: true;
}): readonly string[] => Object.keys(f);

const DRIFT = felder<Drift>({
  stufe: true,
  abweichung: true,
  cashAbweichung: true,
  berechnetGesamtCent: true,
  gemeldetGesamtCent: true,
  grund: true,
  positionen: true,
});
const XIRR = felder<Exclude<XirrErgebnis, { art: 'ok' }>>({
  art: true,
  rate: true,
});
const MAX_DRAWDOWN = felder<Exclude<MaxDrawdownErgebnis, { art: 'ok' }>>({
  art: true,
  anteil: true,
  tagHoch: true,
  tagTief: true,
});
const VOLATILITAET = felder<Exclude<VolatilitaetErgebnis, { art: 'ok' }>>({
  art: true,
  proJahr: true,
  monate: true,
});
const SHARPE = felder<Exclude<SharpeErgebnis, { art: 'ok' }>>({
  art: true,
  wert: true,
  monate: true,
  zinsProJahr: true,
});
const REAL = felder<KennzahlenAntwort['real']>({
  exakt: true,
  fisher: true,
  basisMonat: true,
  teuerungBisMonat: true,
  fortgeschriebeneMonate: true,
  teuerungLaufendesJahr: true,
});

function schluessel(pfad: string, ist: unknown, soll: readonly string[]): void {
  expect(Object.keys(ist as object).sort(), pfad).toEqual([...soll].sort());
}

async function holen(app: FastifyInstance, pfad: string): Promise<Record<string, unknown>> {
  const antwort = await app.inject({
    method: 'GET',
    url: pfad,
    headers: eigeneHerkunft(),
  });
  expect(antwort.statusCode, pfad).toBe(200);
  return JSON.parse(antwort.body) as Record<string, unknown>;
}

describe('Vertragstest: server/vertrag.ts gegen die tatsaechliche Antwort', () => {
  it('GET /api/health', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/health');
    schluessel(
      'health',
      body,
      felder<Health>({
        ok: true,
        version: true,
        kernVersion: true,
        top25: true,
        lauf: true,
        stand: true,
        drift: true,
      }),
    );
    expect(body.lauf).toBeNull();
    schluessel('health.drift', body.drift, DRIFT);
  });

  it('GET /api/aufteilung', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/aufteilung');
    schluessel(
      'aufteilung',
      body,
      felder<Aufteilung>({
        cashCent: true,
        cashAnteil: true,
        positionen: true,
        stand: true,
        drift: true,
      }),
    );
    expect(body.positionen).toEqual([]);
    schluessel('aufteilung.drift', body.drift, DRIFT);
  });

  it('GET /api/rebalancing', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/rebalancing?ziel=KONTO:10000');
    schluessel(
      'rebalancing',
      body,
      felder<Rebalancing>({
        art: true,
        zeilen: true,
        gesamtCent: true,
        stand: true,
        drift: true,
      }),
    );
    expect(body.art).toBe('ohneWert');
    schluessel(
      'rebalancing.zeilen[0]',
      (body.zeilen as unknown[])[0],
      felder<RebalancingZeile>({
        schluessel: true,
        name: true,
        imDepot: true,
        istCent: true,
        istAnteil: true,
        zielBp: true,
        abweichung: true,
        sollCent: true,
        deltaCent: true,
      }),
    );
    schluessel('rebalancing.drift', body.drift, DRIFT);
  });

  it('GET /api/fluesse', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/fluesse');
    schluessel(
      'fluesse',
      body,
      felder<Fluesse>({
        monate: true,
        schnittCent: true,
        schnitt12Cent: true,
        medianCent: true,
        fenster: true,
        stand: true,
        drift: true,
      }),
    );
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
    schluessel(
      'kennzahlen',
      body,
      felder<KennzahlenAntwort>({
        investiertCent: true,
        kursgewinnCent: true,
        kursgewinnProzent: true,
        realisiertCent: true,
        zinsenCent: true,
        steuernCent: true,
        gebuehrenCent: true,
        gesamtCent: true,
        twr: true,
        twrProJahr: true,
        twrGrob: true,
        xirr: true,
        inflation: true,
        real: true,
        sparrateCent: true,
        sparrate12Cent: true,
        maxDrawdown: true,
        volatilitaetProJahr: true,
        sharpe: true,
        hinweise: true,
        zinsenTransaktionen: true,
        steuernTransaktionen: true,
        gebuehrenTransaktionen: true,
        realisierteVerkaeufe: true,
        stand: true,
        drift: true,
      }),
    );
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
    schluessel(
      'lauf',
      body,
      felder<Lauf>({
        laufId: true,
        status: true,
        schritt: true,
        quellen: true,
        hinweise: true,
        gestartet: true,
        beendet: true,
        fehler: true,
        stand: true,
        drift: true,
      }),
    );
    expect(body.fehler).toBeNull();
    schluessel('lauf.drift', body.drift, DRIFT);
  });

  it('GET /api/mcp-anmeldung', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/mcp-anmeldung');
    schluessel(
      'mcp-anmeldung',
      body,
      felder<McpAnmeldung>({
        angemeldet: true,
        laeuft: true,
        fehler: true,
        stand: true,
        drift: true,
      }),
    );
    expect(body.fehler).toBeNull();
    schluessel('mcp-anmeldung.drift', body.drift, DRIFT);
  });

  it('GET /api/sparplaene', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/sparplaene');
    schluessel(
      'sparplaene',
      body,
      felder<Sparplaene>({
        plaene: true,
        summeCent: true,
        stand: true,
        drift: true,
      }),
    );
    expect(body.plaene).toEqual([]);
    schluessel('sparplaene.drift', body.drift, DRIFT);
  });

  it('GET /api/top25', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/top25');
    schluessel(
      'top25',
      body,
      felder<Top25>({
        zeilen: true,
        topAnteil: true,
        abdeckung: true,
        durchschautCent: true,
        anzahlUnternehmen: true,
        fehlendeFonds: true,
        stand: true,
        drift: true,
      }),
    );
    expect(body.zeilen).toEqual([]);
    schluessel('top25.drift', body.drift, DRIFT);
  });

  it('GET /api/zeitreihe', async () => {
    const { app } = await testServer();
    const body = await holen(app, '/api/zeitreihe');
    schluessel(
      'zeitreihe',
      body,
      felder<Zeitreihe>({
        punkte: true,
        marken: true,
        grob: true,
        reiheLeer: true,
        zeitraum: true,
        ausschnitt: true,
        tage: true,
        fensterGewinnCent: true,
        fensterGewinnProzent: true,
        benchmark: true,
        stand: true,
        drift: true,
      }),
    );
    schluessel('zeitreihe.drift', body.drift, DRIFT);
  });

  it('GET /api/jahre', async () => {
    // Mit Demodaten: die Zeilen gehen erst mit einer Reihe ueber die Leitung.
    const db = await testDatenbank();
    const jetzt = new Date().toISOString();
    const { heute } = seedeDatenbank(db, tagAus(jetzt), jetzt);
    const { app } = baueServer({
      db,
      konfiguration: konfiguration(),
      distPfad: join(tmpdir(), 'portfolio-kein-dist'),
      heute,
      protokoll: false,
    });
    const body = await holen(app, '/api/jahre?benchmark=IE00B4L5Y983');
    schluessel(
      'jahre',
      body,
      felder<Jahre>({
        jahre: true,
        benchmark: true,
        stand: true,
        drift: true,
      }),
    );
    const zeilen = body.jahre as unknown[];
    expect(zeilen.length).toBeGreaterThan(1);
    schluessel(
      'jahre.jahre[0]',
      zeilen[0],
      felder<Jahreszeile>({
        jahr: true,
        ab: true,
        bis: true,
        twr: true,
        vergleich: true,
        teuerung: true,
        teuerungBisMonat: true,
        real: true,
        gewinnCent: true,
        einzahlungCent: true,
        endwertCent: true,
      }),
    );
    schluessel('jahre.benchmark', body.benchmark, ['isin', 'name']);
    schluessel('jahre.drift', body.drift, DRIFT);
  });
});
