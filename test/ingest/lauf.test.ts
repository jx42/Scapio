/**
 * `ingest/lauf.ts`: die zwei Stellen, die keiner anderen Testdatei gehoeren.
 *
 * 1. Die beiden Bug-1-Abbrueche in der Transaktionsquelle (`E_MCP_SEITEN`, wenn der
 *    Seitendeckel greift, `E_MCP_UNVOLLSTAENDIG`, wenn eine Seite mehr oder weniger
 *    Zeilen liefert als ihr eigenes `returnedCount` behauptet) — ueber den echten
 *    Transport (`ingest/mcp.ts`, nur `fetch` gemockt) statt `mcpAufrufRoh` selbst zu
 *    mocken, damit tatsaechlich der Seitendeckel und die Zeilenpruefung laufen, nicht
 *    ein Stellvertreter dafuer.
 * 2. `main()`s Sperre: ein zweiter Ingest waehrend die erste Sperre haelt, muss sauber
 *    (kein Absturz, `exitCode = 1`) abbrechen, BEVOR er die Datenbank oeffnet — und eine
 *    Datenbank, die sich nicht oeffnen laesst, darf die Sperre nicht liegen lassen.
 * 3. `fuehreLaufAus`: der Code einer spaeten Quelle (401 mitten im Lauf) erreicht `lauf`.
 * 4. `fuehreLaufAus` ohne `top25`: kein Abruf bei einem Fondsanbieter [ADR-038].
 * 5. `fuehreLaufAus`: gescheiterte Transaktionen und eine als Ganzes gescheiterte
 *    Fondsaufloesung hinterlassen `quelleGescheitert` mit Code.
 *
 * Die Storno-Bremse (dritter Bug-1-Baustein) ist an ihrer eigentlichen Grenze getestet —
 * `test/invarianten/inv-09.test.ts`, `describe('INV-09 — atomar')`. Ein Test hier muesste
 * dafuer jede Quelle von `fuehreLaufAus` mocken, ohne eine zusaetzliche Verhaltensgrenze
 * zu pruefen.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tag } from '../../core/kalender.ts';
import type { Konfiguration } from '../../shared/konfiguration.ts';
import type * as KonfigurationModul from '../../shared/konfiguration.ts';
import type * as FondsaufloesungModul from '../../ingest/fondsaufloesung.ts';
import type { Kontext } from '../../ingest/importieren.ts';
import { FIXTURE, json } from '../fixtures/index.ts';

vi.mock('../../ingest/mcpAnmeldung.ts', () => ({ zugriffstoken: vi.fn() }));
// Durchreichend: nur der Test zur gescheiterten Fondsaufloesung laesst den Katalogabruf werfen.
vi.mock('../../ingest/fondsaufloesung.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof FondsaufloesungModul>();
  return { ...actual, katalogeAbrufen: vi.fn(actual.katalogeAbrufen) };
});
vi.mock('../../shared/konfiguration.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof KonfigurationModul>();
  return { ...actual, ladeKonfiguration: vi.fn() };
});

const { McpFehler, mcpSitzungVergessen } = await import('../../ingest/mcp.ts');
const { zugriffstoken } = await import('../../ingest/mcpAnmeldung.ts');
const { holeTransaktionen } = await import('../../ingest/quellen/transaktionen.ts');
const { Befunde } = await import('../../ingest/plausibilitaet.ts');
const konfigurationModul = await import('../../shared/konfiguration.ts');
const { fuehreLaufAus, main } = await import('../../ingest/lauf.ts');
const { testDatenbank } = await import('../../db/verbindung.ts');
const repository = await import('../../db/repository/index.ts');
const { SPERRDATEI } = await import('../../server/sperre.ts');
const { katalogeAbrufen } = await import('../../ingest/fondsaufloesung.ts');

const ladeKonfigurationMock = vi.mocked(konfigurationModul.ladeKonfiguration);

const HEUTE = '2026-08-26' as Tag;
const JETZT = '2026-08-26T18:00:00+02:00';

const tempDirs: string[] = [];

function konfiguration(teil: Partial<Konfiguration> = {}): Konfiguration {
  const datenpfad = mkdtempSync(join(tmpdir(), 'lauf-test-'));
  tempDirs.push(datenpfad);
  return {
    port: 4732,
    datenverzeichnis: datenpfad,
    datenpfad,
    mcpZeitlimitMs: 120_000,
    csvZeitlimitMs: 30_000,
    csvGroesstMb: 32,
    erlaubteHosts: [],
    fondsKatalogFrischeTage: 5,
    inflationsquelle: 'eurostat',
    zinsquelle: 'ecb',
    driftSchwellen: { hinweis: 0.001, banner: 0.005, abbruch: 0.02 },
    top25: true,
    ...teil,
  };
}

function kontext(teil: Partial<Kontext> = {}): Kontext {
  return {
    konfiguration: konfiguration(),
    heute: HEUTE,
    jetzt: JETZT,
    befunde: new Befunde(),
    ...teil,
  };
}

type RpcBody = {
  readonly jsonrpc: string;
  readonly id?: number;
  readonly method: string;
  readonly params?: { readonly name?: string; readonly arguments?: Record<string, unknown> };
};

/**
 * Ersetzt `global.fetch` durch einen Handler, der den JSON-RPC-Rumpf jeder Anfrage auswertet
 * — dieselbe Technik wie in `mcp.test.ts`, hier nur lokal nachgebaut, weil dort nichts
 * exportiert ist, das man importieren koennte.
 */
function fetchMock(handler: (rpc: RpcBody) => Response | Promise<Response>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_ziel: string | URL, optionen: RequestInit = {}) => {
      const rpc = JSON.parse(String(optionen.body)) as RpcBody;
      return handler(rpc);
    }),
  );
}

function jsonAntwort(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function initOk(): Response {
  return jsonAntwort(200, { jsonrpc: '2.0', id: 1, result: {} });
}

function notifOk(): Response {
  return jsonAntwort(200, { jsonrpc: '2.0', result: {} });
}

function toolOk(payload: unknown): Response {
  return jsonAntwort(200, { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } });
}

/** Eine gueltige `security: null, cash: {...}`-Zeile — genuegt der Zeitstempel/Schema-Pruefung. */
function gueltigeZeile(id: string) {
  return {
    id,
    kind: 'cash',
    category: 'TRANSFER',
    status: 'EXECUTED',
    currency: 'EUR',
    isCancellation: false,
    lastEventAt: '2026-01-05T10:00:00+01:00',
    description: null,
    custodian: 'BNP',
    security: null,
    cash: { relatedIsin: null, transactionType: 'DEPOSIT', amount: 10 },
    nonTradeSecurity: null,
    eltif: null,
  };
}

beforeEach(() => {
  mcpSitzungVergessen();
  vi.mocked(zugriffstoken).mockReset();
  vi.mocked(zugriffstoken).mockResolvedValue('token-test');
  ladeKonfigurationMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.exitCode = undefined;
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('holeTransaktionen — Bug 1: stiller Seitenverlust', () => {
  it('bricht mit E_MCP_SEITEN ab, statt eine unvollstaendige Historie als vollstaendig zu behandeln', async () => {
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      // Jede Seite meldet einen weiteren Cursor — es gibt nie eine letzte Seite.
      return toolOk({ page: { nextCursor: 'weiter', totalCount: 0, returnedCount: 0 }, transactions: [] });
    });

    const fehler = await holeTransaktionen(kontext()).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as InstanceType<typeof McpFehler>).code).toBe('E_MCP_SEITEN');
  });

  it('bricht mit E_MCP_UNVOLLSTAENDIG ab, wenn eine Seite weniger Zeilen liefert als ihr returnedCount behauptet', async () => {
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      return toolOk({
        page: { nextCursor: null, totalCount: 2, returnedCount: 2 },
        transactions: [gueltigeZeile('x-1')],
      });
    });

    const fehler = await holeTransaktionen(kontext()).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as InstanceType<typeof McpFehler>).code).toBe('E_MCP_UNVOLLSTAENDIG');
  });
});

describe('main() — Sperre vor der Datenbank', () => {
  it('verweigert einen zweiten Ingest, waehrend eine Sperre haelt, statt gleichzeitig zu schreiben', async () => {
    const fixeKonfiguration = konfiguration();
    ladeKonfigurationMock.mockReturnValue(fixeKonfiguration);

    // Simuliert den Server (oder einen zweiten Ingest-Lauf), der die Sperre bereits haelt —
    // ueber eine ANDERE, lebende pid: `Sperre#nimm` behandelt eine Sperrdatei mit der
    // eigenen pid bewusst als Reentranz desselben Prozesses (siehe Kommentar dort), ein
    // zweites `new Sperre(...)` im selben Testprozess wuerde also keinen Konflikt ausloesen.
    // `process.ppid` ist ein echter, lebender Prozess (der Testrunner selbst), aber eine
    // andere pid als `process.pid` — genau das Bild eines zweiten, fremden Prozesses.
    writeFileSync(
      join(fixeKonfiguration.datenpfad, SPERRDATEI),
      JSON.stringify({ quelle: 'server', seit: new Date().toISOString(), pid: process.ppid }),
      { mode: 0o600 },
    );

    const meldungen: unknown[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      meldungen.push(args.join(' '));
    });

    try {
      await expect(main()).resolves.toBeUndefined();

      expect(process.exitCode).toBe(1);
      expect(meldungen.some((m) => String(m).includes('Sperre nicht erhalten'))).toBe(true);
      expect(meldungen.some((m) => String(m).includes('RUNBOOK'))).toBe(true);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('main() — Sperre und Datenbank', () => {
  it('gibt die Sperre frei und meldet einen Satz, wenn sich die Datenbank nicht oeffnen laesst', async () => {
    const fixeKonfiguration = konfiguration();
    ladeKonfigurationMock.mockReturnValue(fixeKonfiguration);

    // Eine Datenbank, die neuer ist als jede Migration dieser Installation: `oeffneDatenbank`
    // wirft, nachdem `main()` die Sperre schon genommen hat.
    const neuere = new DatabaseSync(konfigurationModul.dbPfad(fixeKonfiguration));
    neuere.exec('PRAGMA user_version = 9999');
    neuere.close();

    const meldungen: string[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      meldungen.push(args.join(' '));
    });

    try {
      await expect(main()).resolves.toBeUndefined();
    } finally {
      consoleError.mockRestore();
    }

    expect(process.exitCode).toBe(1);
    expect(meldungen.some((m) => m.includes('Diese Datenbank ist neuer'))).toBe(true);
    expect(existsSync(join(fixeKonfiguration.datenpfad, SPERRDATEI))).toBe(false);
  }, 30_000); // Oeffnet eine Datenbankdatei samt Sperre; unter Windows dauert das Sekunden.
});

describe('fuehreLaufAus — Fehlercode je Quelle', () => {
  it('meldet E_MCP_ANMELDUNG auch dann, wenn ein 401 erst eine spaete Quelle trifft', async () => {
    // Holdings und Transaktionen gelingen, alles Weitere (Kurse, Sparplaene, ...) antwortet 401 —
    // der Token laeuft mitten im Lauf ab. Cash scheitert am Schema, nicht an der Anmeldung.
    let werkzeugaufrufe = 0;
    let nach401 = 0;
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      werkzeugaufrufe += 1;
      const tool = rpc.params?.name ?? '';
      if (tool.endsWith('get_portfolio_holdings')) return toolOk(json(FIXTURE.holdings));
      if (tool.endsWith('get_portfolio_cash_breakdown')) return toolOk({});
      if (tool.endsWith('list_portfolio_transactions')) return toolOk(json(FIXTURE.transaktionen));
      nach401 += 1;
      return new Response('', { status: 401 });
    });

    const db = await testDatenbank();
    const ergebnis = await fuehreLaufAus({ db, konfiguration: konfiguration(), heute: HEUTE });

    expect(ergebnis.quellen.holdings).toBe('erfolg');
    expect(ergebnis.quellen.transaktionen).toBe('erfolg');
    expect(ergebnis.quellen.sparplaene).toBe('fehler');
    expect(ergebnis.status).toBe('teilweise');
    expect(ergebnis.fehlerCode).toBe('E_MCP_ANMELDUNG');
    // Der Code je Quelle ueberlebt den Lauf als Hinweis — die Oberflaeche nennt daraus Ursache und Abhilfe.
    expect(ergebnis.hinweise).toContainEqual({ art: 'quelleGescheitert', werte: { quelle: 'sparplaene', code: 'E_MCP_ANMELDUNG' } });
    expect(repository.lauf.letzter(db)?.fehlerCode).toBe('E_MCP_ANMELDUNG');
    // Laufweiter Kurzschluss [ADR-031]: nach dem ersten 401 erreicht kein NEUER Aufruf mehr
    // den MCP — nur die Kursabrufe, die schon parallel unterwegs waren (hoechstens vier).
    expect(nach401).toBeGreaterThanOrEqual(1);
    expect(nach401).toBeLessThanOrEqual(4);
    expect(werkzeugaufrufe).toBe(3 + nach401);
  });

  it('meldet gescheiterte Transaktionen mit Code als Hinweis und beendet den Lauf', async () => {
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      const tool = rpc.params?.name ?? '';
      if (tool.endsWith('list_portfolio_transactions')) return toolOk({ unbekannt: true });
      return toolOk({});
    });
    const db = await testDatenbank();
    const ergebnis = await fuehreLaufAus({ db, konfiguration: konfiguration(), heute: HEUTE });

    expect(ergebnis.status).toBe('fehler');
    expect(ergebnis.quellen.transaktionen).toBe('fehler');
    expect(ergebnis.hinweise).toContainEqual({ art: 'quelleGescheitert', werte: { quelle: 'transaktionen', code: ergebnis.fehlerCode } });
    expect(repository.lauf.letzter(db)?.hinweise).toContainEqual({ art: 'quelleGescheitert', werte: { quelle: 'transaktionen', code: ergebnis.fehlerCode } });
  });

  it('meldet eine als Ganzes gescheiterte Fondsaufloesung, statt sie nur zu protokollieren', async () => {
    vi.mocked(katalogeAbrufen).mockRejectedValueOnce(new Error('Programmierfehler'));
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      const tool = rpc.params?.name ?? '';
      if (tool.endsWith('get_portfolio_holdings')) return toolOk(json(FIXTURE.holdings));
      if (tool.endsWith('list_portfolio_transactions')) return toolOk(json(FIXTURE.transaktionen));
      return toolOk({});
    });
    const db = await testDatenbank();
    const ergebnis = await fuehreLaufAus({ db, konfiguration: konfiguration(), heute: HEUTE });

    expect(vi.mocked(katalogeAbrufen)).toHaveBeenCalled();
    expect(ergebnis.quellen.fondsaufloesung).toBe('fehler');
    expect(ergebnis.status).toBe('teilweise');
    expect(ergebnis.hinweise).toContainEqual({ art: 'quelleGescheitert', werte: { quelle: 'fondsaufloesung', code: 'E_UNBEKANNT' } });
  });

  it('schliesst den Lauf mit "fehler", wenn ausserhalb der Schritt-Fangnetze etwas wirft', async () => {
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      return new Response('', { status: 401 });
    });
    const db = await testDatenbank();
    const ergebnis = await fuehreLaufAus({
      db,
      konfiguration: konfiguration(),
      heute: HEUTE,
      melde: (quelle) => {
        if (quelle === 'transaktionen') throw new Error('Programmierfehler');
      },
    });

    expect(ergebnis.status).toBe('fehler');
    expect(repository.lauf.letzter(db)?.status).toBe('fehler');
  });
});

describe('fuehreLaufAus — Schalter top25 [ADR-038]', () => {
  async function laufMit(top25: boolean): Promise<{ hosts: Set<string>; quellen: Readonly<Record<string, string>> }> {
    const hosts = new Set<string>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (ziel: string | URL, optionen: RequestInit = {}) => {
        const host = new URL(String(ziel)).host;
        hosts.add(host);
        if (host !== 'mcp.scalable.capital') return new Response('', { status: 404 });
        const rpc = JSON.parse(String(optionen.body)) as RpcBody;
        if (rpc.method === 'initialize') return initOk();
        if (rpc.method === 'notifications/initialized') return notifOk();
        const tool = rpc.params?.name ?? '';
        if (tool.endsWith('get_portfolio_holdings')) return toolOk(json(FIXTURE.holdings));
        if (tool.endsWith('list_portfolio_transactions')) return toolOk(json(FIXTURE.transaktionen));
        return toolOk({});
      }),
    );
    const db = await testDatenbank();
    const ergebnis = await fuehreLaufAus({ db, konfiguration: konfiguration({ top25, erlaubteHosts: ['www.ishares.com', 'etf.dws.com', 'www.amundietf.de'] }), heute: HEUTE });
    return { hosts, quellen: ergebnis.quellen };
  }

  it('ruft ohne top25 keinen Fondsanbieter ab und meldet den Schritt als uebersprungen', async () => {
    const { hosts, quellen } = await laufMit(false);
    expect(quellen.fonds).toBe('übersprungen');
    expect(Object.keys(quellen).filter((q) => q.startsWith('fondskatalog:'))).toEqual([]);
    for (const host of ['www.ishares.com', 'etf.dws.com', 'www.amundietf.de']) expect(hosts).not.toContain(host);
  });

  it('fragt mit top25 die Fondskataloge ab', async () => {
    const { quellen } = await laufMit(true);
    expect(Object.keys(quellen).some((q) => q.startsWith('fondskatalog:'))).toBe(true);
  });
});
