/**
 * Der direkte JSON-RPC-Transport gegen den Scalable-MCP (`ingest/mcp.ts`). [ADR-010]
 *
 * `mcpAnmeldung.ts` ist komplett gemockt — dieser Datei geht es nur um den Transport
 * (JSON-RPC-Rumpf, Sitzungs-Header, JSON-/SSE-Antwortformat, Blaettern, Zeitlimit,
 * Sitzungserneuerung nach 404, Allowlist), nicht um die Anmeldung selbst (siehe
 * `mcpAnmeldung.test.ts`). `zugriffstoken` liefert in jedem Test einen festen Testwert, ohne
 * je echt zu pruefen. `global.fetch` ist in jedem Test gemockt — kein echter Netzzugriff gegen
 * `mcp.scalable.capital`. Tests, die ein `datenpfad` brauchen, bekommen eines per `mkdtempSync`.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { konfigurationFuer, type Konfiguration } from '../../shared/konfiguration.ts';
import type { LesendesTool } from '../../ingest/mcp.ts';
import type { Hinweis } from '../../shared/hinweise.ts';

vi.mock('../../ingest/mcpAnmeldung.ts', () => ({ zugriffstoken: vi.fn() }));

const { McpFehler, McpSicherung, ZEITFEHLER_BIS_ABBRUCH, ZEITFEHLER_IM_LAUF_BIS_ABBRUCH, mcpAufrufRoh, mcpSitzungVergessen } =
  await import('../../ingest/mcp.ts');
const { zugriffstoken } = await import('../../ingest/mcpAnmeldung.ts');

// Zwei Tools aus der Allowlist in `mcp.ts`, hier als Vertrag nachgebildet (nicht exportiert
// mit eigenem Namen, den man importieren koennte, ohne die ganze Liste mitzunehmen).
const HOLDINGS_TOOL: LesendesTool = 'get_portfolio_holdings';
const TRANSAKTIONEN_TOOL: LesendesTool = 'list_portfolio_transactions';

const sofort = (_ms: number): Promise<void> => Promise.resolve();

const tempDirs: string[] = [];

function frischeKonfiguration(): Konfiguration {
  const datenpfad = mkdtempSync(join(tmpdir(), 'mcp-test-'));
  tempDirs.push(datenpfad);
  return konfigurationFuer(datenpfad, { port: 4732, erlaubteHosts: [] });
}

type RpcBody = {
  readonly jsonrpc: string;
  readonly id?: number;
  readonly method: string;
  readonly params?: { readonly name?: string; readonly arguments?: Record<string, unknown> };
};

type FetchAufruf = { readonly url: string; readonly optionen: RequestInit; readonly rpc: RpcBody };

/**
 * Ersetzt `global.fetch` durch einen Handler, der den JSON-RPC-Rumpf jeder Anfrage auswertet
 * (statt ueber URL-Praefixe zu routen — jede Anfrage geht an dieselbe `/mcp`-Adresse).
 */
function fetchMock(handler: (rpc: RpcBody, aufrufNr: number) => Response | Promise<Response>): {
  readonly calls: FetchAufruf[];
} {
  const calls: FetchAufruf[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (ziel: string | URL, optionen: RequestInit = {}) => {
      const url = String(ziel);
      const rpc = JSON.parse(String(optionen.body)) as RpcBody;
      calls.push({ url, optionen, rpc });
      return handler(rpc, calls.length);
    }),
  );
  return { calls };
}

function jsonAntwort(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function initOk(headers: Record<string, string> = {}): Response {
  return jsonAntwort(200, { jsonrpc: '2.0', id: 1, result: {} }, headers);
}

function notifOk(): Response {
  return jsonAntwort(200, { jsonrpc: '2.0', result: {} });
}

function toolOk(payload: unknown, headers: Record<string, string> = {}): Response {
  return jsonAntwort(
    200,
    { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } },
    headers,
  );
}

function toolSse(payload: unknown): Response {
  const rpcAntwort = { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } };
  const rumpf = `event: message\ndata: ${JSON.stringify(rpcAntwort)}\n\n`;
  return new Response(rumpf, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

beforeEach(() => {
  mcpSitzungVergessen();
  vi.mocked(zugriffstoken).mockReset();
  vi.mocked(zugriffstoken).mockResolvedValue('token-test');
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('mcpAufrufRoh', () => {
  it('schickt den tools/call-Rumpf im erwarteten JSON-RPC-Format', async () => {
    const k = frischeKonfiguration();
    const payload = { holdings: [], cryptoHoldings: [] };
    const { calls } = fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      if (rpc.method === 'tools/call') return toolOk(payload);
      throw new Error(`Testfehler: unerwartete Methode ${rpc.method}.`);
    });

    const antwort = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort });

    expect(antwort.bloecke).toEqual([payload]);

    const aufruf = calls.find((c) => c.rpc.method === 'tools/call');
    expect(aufruf).toBeDefined();
    expect(aufruf!.rpc).toMatchObject({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'get_portfolio_holdings', arguments: {} },
    });
    expect(typeof aufruf!.rpc.id).toBe('number');

    const headers = aufruf!.optionen.headers as unknown as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers.accept).toBe('application/json, text/event-stream');
    expect(headers.authorization).toBe('Bearer token-test');
    expect(aufruf!.optionen.redirect).toBe('manual');
  });

  it('schickt die Mcp-Session-Id aus der ersten Antwort bei jedem folgenden Aufruf mit — auch ueber zwei mcpAufrufRoh-Aufrufe hinweg, ohne mcpSitzungVergessen() dazwischen', async () => {
    const k = frischeKonfiguration();
    const SESSION = 'sitzung-abc-123';
    const payload = { holdings: [], cryptoHoldings: [] };
    const { calls } = fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk({ 'mcp-session-id': SESSION });
      if (rpc.method === 'notifications/initialized') return notifOk();
      if (rpc.method === 'tools/call') return toolOk(payload);
      throw new Error(`Testfehler: unerwartete Methode ${rpc.method}.`);
    });

    await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort });
    await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort });

    // Die allererste Anfrage (initialize) kennt die Sitzung noch nicht.
    const initHeaders = calls[0]!.optionen.headers as unknown as Record<string, string>;
    expect(initHeaders['mcp-session-id']).toBeUndefined();

    // Jede folgende Anfrage traegt sie — auch die des zweiten, unabhaengigen mcpAufrufRoh-Aufrufs.
    for (const aufruf of calls.slice(1)) {
      const headers = aufruf.optionen.headers as unknown as Record<string, string>;
      expect(headers['mcp-session-id']).toBe(SESSION);
    }

    // Der zweite Aufruf initialisiert nicht erneut (Modulzustand bleibt gesetzt) — nur ein tools/call mehr.
    expect(calls.filter((c) => c.rpc.method === 'tools/call')).toHaveLength(2);
    expect(calls.filter((c) => c.rpc.method === 'initialize')).toHaveLength(1);
  });

  it('ueberspringt eine Benachrichtigung vor der Antwort im SSE-Strom', async () => {
    const k = frischeKonfiguration();
    const payload = { holdings: [] };
    const antwort = { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } };
    const hinweis = { jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1 } };
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      const rumpf = `event: message\ndata: ${JSON.stringify(hinweis)}\n\nevent: message\ndata: ${JSON.stringify(antwort)}\n\n`;
      return new Response(rumpf, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });

    expect((await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort })).bloecke).toEqual([payload]);
  });

  it('meldet einen JSON-RPC-Fehler als E_MCP_RPC mit Code, ohne Wiederholung und ohne den Fehlertext', async () => {
    const k = frischeKonfiguration();
    let toolAufrufe = 0;
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      toolAufrufe += 1;
      return jsonAntwort(200, { jsonrpc: '2.0', id: 2, error: { code: -32602, message: 'Depot 4711 unbekannt' } });
    });

    const fehler = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort }).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as InstanceType<typeof McpFehler>).code).toBe('E_MCP_RPC');
    expect((fehler as Error).message).toContain('-32602');
    expect((fehler as Error).message).not.toContain('4711');
    expect(toolAufrufe).toBe(1);
  });

  it('lehnt eine Antwort ab, die kein JSON-RPC-Umschlag ist [INV-12]', async () => {
    const k = frischeKonfiguration();
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      return jsonAntwort(200, { result: { content: [] } });
    });

    const fehler = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort }).catch((f: unknown) => f);

    expect((fehler as InstanceType<typeof McpFehler>).code).toBe('E_MCP_ABGELEHNT');
    expect((fehler as Error).message).toContain('keine JSON-RPC-Nachricht');
  });

  it('liefert aus einer application/json- und einer text/event-stream-Antwort denselben Inhalt', async () => {
    const k = frischeKonfiguration();
    const payload = { holdings: [{ isin: 'DE0001234567', wert: 42 }] };

    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      return toolOk(payload);
    });
    const jsonErgebnis = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort });

    mcpSitzungVergessen();
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      return toolSse(payload);
    });
    const sseErgebnis = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort });

    expect(jsonErgebnis.bloecke).toEqual([payload]);
    expect(sseErgebnis.bloecke).toEqual([payload]);
    expect(sseErgebnis.bloecke).toEqual(jsonErgebnis.bloecke);
  });

  it('blaettert list_portfolio_transactions bis nextCursor null ist', async () => {
    const k = frischeKonfiguration();
    const seite1 = {
      page: { nextCursor: 'seite-2', totalCount: 5, returnedCount: 3 },
      transactions: [{ id: '1' }, { id: '2' }, { id: '3' }],
    };
    const seite2 = {
      page: { nextCursor: null, totalCount: 5, returnedCount: 2 },
      transactions: [{ id: '4' }, { id: '5' }],
    };

    const { calls } = fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      const cursor = rpc.params?.arguments?.cursor;
      return toolOk(cursor === undefined ? seite1 : seite2);
    });

    const antwort = await mcpAufrufRoh(TRANSAKTIONEN_TOOL, { konfiguration: k, warte: sofort });

    expect(antwort.bloecke).toEqual([seite1, seite2]);
    expect(JSON.parse(antwort.rohJson)).toEqual([seite1, seite2]);

    const seitenAufrufe = calls.filter((c) => c.rpc.method === 'tools/call');
    expect(seitenAufrufe).toHaveLength(2);
    expect(seitenAufrufe[0]!.rpc.params?.arguments).toEqual({ pageSize: 100 });
    expect(seitenAufrufe[1]!.rpc.params?.arguments).toEqual({ pageSize: 100, cursor: 'seite-2' });
  });

  it('warnt ab 80 % der Seitendecke, darunter nicht', async () => {
    const k = frischeKonfiguration();
    const seiten = (anzahl: number): void => {
      fetchMock((rpc) => {
        if (rpc.method === 'initialize') return initOk();
        if (rpc.method === 'notifications/initialized') return notifOk();
        const cursor = rpc.params?.arguments?.cursor;
        const nummer = typeof cursor === 'string' ? Number(cursor) : 1;
        return toolOk({ page: { nextCursor: nummer < anzahl ? String(nummer + 1) : null }, transactions: [] });
      });
    };

    const meldungen: Hinweis[] = [];
    seiten(39);
    await mcpAufrufRoh(TRANSAKTIONEN_TOOL, { konfiguration: k, warte: sofort, melde: (h) => meldungen.push(h) });
    expect(meldungen).toEqual([]);

    seiten(40);
    await mcpAufrufRoh(TRANSAKTIONEN_TOOL, { konfiguration: k, warte: sofort, melde: (h) => meldungen.push(h) });
    expect(meldungen).toEqual([{ art: 'transaktionenSeitenGrenze', werte: { seiten: 40, hoechstens: 50 } }]);
  });

  it('bricht nach mcpZeitlimitMs ab, statt endlos zu haengen, und wirft E_MCP_ZEIT', async () => {
    const k = { ...frischeKonfiguration(), mcpZeitlimitMs: 20 };

    vi.stubGlobal(
      'fetch',
      vi.fn((_ziel: string | URL, optionen: RequestInit = {}) => {
        return new Promise((_resolve, reject) => {
          optionen.signal?.addEventListener('abort', () => {
            const abbruch = new Error('Aborted');
            abbruch.name = 'AbortError';
            reject(abbruch);
          });
        });
      }),
    );

    const fehler = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort }).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as InstanceType<typeof McpFehler>).code).toBe('E_MCP_ZEIT');
  });

  it('baut die Sitzung nach einem Status 404 neu auf und wiederholt den Aufruf genau einmal', async () => {
    const k = frischeKonfiguration();
    const payload = { holdings: [], cryptoHoldings: [] };
    let toolAufrufe = 0;

    const { calls } = fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      if (rpc.method === 'tools/call') {
        toolAufrufe += 1;
        return toolAufrufe === 1 ? new Response(null, { status: 404 }) : toolOk(payload);
      }
      throw new Error(`Testfehler: unerwartete Methode ${rpc.method}.`);
    });

    const meldungen: Hinweis[] = [];
    const antwort = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, melde: (h) => meldungen.push(h) });

    expect(antwort.bloecke).toEqual([payload]);
    expect(calls.filter((c) => c.rpc.method === 'tools/call')).toHaveLength(2);
    // Die Sitzung wurde neu aufgebaut: ein zweites Initialisierungspaar.
    expect(calls.filter((c) => c.rpc.method === 'initialize')).toHaveLength(2);
    expect(meldungen).toEqual([{ art: 'mcpSitzungErneuert', werte: {} }]);
  });

  it('gibt nach einem zweiten 404 in Folge (auch nach Erneuerung) auf, statt endlos zu erneuern', async () => {
    const k = frischeKonfiguration();

    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      return new Response(null, { status: 404 }); // Jeder tools/call-Versuch bleibt 404.
    });

    const fehler = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort }).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as InstanceType<typeof McpFehler>).code).toBe('E_MCP_ABGELEHNT');
  });

  it('wirft E_MCP_ABGELEHNT, wenn beide Versuche scheitern', async () => {
    const k = frischeKonfiguration();

    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      return new Response(null, { status: 500 });
    });

    const fehler = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort }).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as InstanceType<typeof McpFehler>).code).toBe('E_MCP_ABGELEHNT');
  });

  it('lehnt ein nicht in der Allowlist stehendes Werkzeug sofort ab, ohne fetch oder zugriffstoken aufzurufen', async () => {
    const { calls } = fetchMock(() => {
      throw new Error('Testfehler: fetch haette bei einem nicht zugelassenen Tool nie aufgerufen werden duerfen.');
    });

    const fehler = await mcpAufrufRoh('mcp__boesartig__submit_buy_order' as LesendesTool).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as InstanceType<typeof McpFehler>).code).toBe('E_MCP_ARGUMENT');
    expect(calls).toHaveLength(0);
    expect(zugriffstoken).not.toHaveBeenCalled();
  });

  it('folgt keiner Umleitung von /mcp, sondern behandelt sie als gescheiterten Versuch', async () => {
    const k = frischeKonfiguration();

    const { calls } = fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      return new Response(null, { status: 302, headers: { location: 'https://boese.tld/anderswo' } });
    });

    const fehler = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort }).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as InstanceType<typeof McpFehler>).code).toBe('E_MCP_ABGELEHNT');
    expect((fehler as InstanceType<typeof McpFehler>).message).toContain('Umleitung');

    const toolAufrufe = calls.filter((c) => c.rpc.method === 'tools/call');
    expect(toolAufrufe).toHaveLength(2); // genau die zwei planmaessigen Versuche, keine gefolgte Umleitung.
    for (const aufruf of toolAufrufe) {
      expect(aufruf.optionen.redirect).toBe('manual');
    }
  });
});

describe('Wiederholung und laufweiter Kurzschluss [ADR-031]', () => {
  it('wartet bei 429 so lange, wie Retry-After verlangt, und wiederholt einmal', async () => {
    const k = frischeKonfiguration();
    let toolAufrufe = 0;
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      toolAufrufe += 1;
      return toolAufrufe === 1 ? new Response(null, { status: 429, headers: { 'retry-after': '3' } }) : toolOk({ ok: 1 });
    });
    const pausen: number[] = [];

    const antwort = await mcpAufrufRoh(HOLDINGS_TOOL, {
      konfiguration: k,
      warte: (ms) => {
        pausen.push(ms);
        return Promise.resolve();
      },
    });

    expect(antwort.bloecke).toEqual([{ ok: 1 }]);
    expect(pausen).toEqual([3000]);
  });

  it('wartet nicht, wenn Retry-After ueber der Obergrenze liegt, sondern wirft E_MCP_DROSSEL', async () => {
    const k = frischeKonfiguration();
    let toolAufrufe = 0;
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      toolAufrufe += 1;
      return new Response(null, { status: 429, headers: { 'retry-after': '600' } });
    });
    const warte = vi.fn(sofort);

    const fehler = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte }).catch((f: unknown) => f);

    expect((fehler as InstanceType<typeof McpFehler>).code).toBe('E_MCP_DROSSEL');
    expect(toolAufrufe).toBe(1);
    expect(warte).not.toHaveBeenCalled();
  });

  it('wartet vor der Wiederholung eines gewoehnlichen Fehlers', async () => {
    const k = frischeKonfiguration();
    fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk();
      if (rpc.method === 'notifications/initialized') return notifOk();
      return new Response(null, { status: 500 });
    });
    const warte = vi.fn(sofort);

    await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte }).catch(() => undefined);

    expect(warte).toHaveBeenCalledTimes(1);
    expect(warte.mock.calls[0]![0]).toBeGreaterThan(0);
  });

  it('ruft nach E_MCP_ANMELDUNG in diesem Lauf den MCP nicht mehr auf und vergisst die Sitzung', async () => {
    const k = frischeKonfiguration();
    const { calls } = fetchMock((rpc) => {
      if (rpc.method === 'initialize') return initOk({ 'mcp-session-id': 'alt' });
      if (rpc.method === 'notifications/initialized') return notifOk();
      return new Response(null, { status: 401 });
    });
    const sicherung = new McpSicherung();

    const erster = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, sicherung, warte: sofort }).catch((f: unknown) => f);
    const anzahl = calls.length;
    const zweiter = await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, sicherung, warte: sofort }).catch((f: unknown) => f);

    expect((erster as InstanceType<typeof McpFehler>).code).toBe('E_MCP_ANMELDUNG');
    expect((zweiter as InstanceType<typeof McpFehler>).code).toBe('E_MCP_ANMELDUNG');
    expect(calls.length).toBe(anzahl);
    expect(sicherung.ausgeloest).toBe(true);

    // Ohne Sicherung (naechster Lauf) beginnt eine neue Sitzung, ohne die alte Session-Id.
    await mcpAufrufRoh(HOLDINGS_TOOL, { konfiguration: k, warte: sofort }).catch(() => undefined);
    const neu = calls.slice(anzahl);
    expect(neu[0]!.rpc.method).toBe('initialize');
    expect((neu[0]!.optionen.headers as Record<string, string>)['mcp-session-id']).toBeUndefined();
  });

  it(`loest nach ${String(ZEITFEHLER_BIS_ABBRUCH)} Zeitueberschreitungen in Folge aus, nicht nach einer`, () => {
    const sicherung = new McpSicherung();
    const zeit = new McpFehler('E_MCP_ZEIT', '-', 'Zeitlimit');
    sicherung.fehler(zeit);
    sicherung.erfolg();
    for (let i = 1; i < ZEITFEHLER_BIS_ABBRUCH; i += 1) sicherung.fehler(zeit);
    expect(sicherung.ausgeloest).toBe(false);
    sicherung.fehler(zeit);
    expect(sicherung.ausgeloest).toBe(true);
    expect(() => sicherung.pruefe(HOLDINGS_TOOL)).toThrow(McpFehler);
  });

  it(`loest nach ${String(ZEITFEHLER_IM_LAUF_BIS_ABBRUCH)} Zeitueberschreitungen im Lauf aus, auch mit Erfolgen dazwischen`, () => {
    // Vier parallele Kursabrufe: Erfolge der anderen setzen die Folge immer wieder zurueck.
    const sicherung = new McpSicherung();
    const zeit = new McpFehler('E_MCP_ZEIT', '-', 'Zeitlimit');
    for (let i = 1; i < ZEITFEHLER_IM_LAUF_BIS_ABBRUCH; i += 1) {
      sicherung.fehler(zeit);
      sicherung.erfolg();
    }
    expect(sicherung.ausgeloest).toBe(false);
    sicherung.fehler(zeit);
    expect(sicherung.ausgeloest).toBe(true);
  });
});
