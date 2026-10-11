/**
 * Die direkte OAuth/PKCE-Anmeldung am Scalable-MCP (`ingest/mcpAnmeldung.ts`). [ADR-010]
 *
 * Zwei Dinge duerfen in dieser Datei UNTER KEINEN UMSTAENDEN passieren: ein echter Browser
 * geht auf (`browser.ts` ist deshalb ganz oben gemockt, `node:child_process` zusaetzlich als
 * zweites Netz — kein `execFile` verlaesst je diesen Prozess) und eine echte
 * Konfiguration/Datei unter `~/Library/Application Support/...`
 * wird beruehrt (jeder Test bekommt ein frisches `datenpfad` per `mkdtempSync`, in `afterEach`
 * wieder entfernt). `global.fetch` ist in jedem Test gemockt — kein echter Netzzugriff gegen
 * `mcp.scalable.capital`. Die einzige Ausnahme ist der lokale Redirect-Server: der laeuft
 * wirklich auf `127.0.0.1:8732`, deshalb simulieren die beiden `anmelden()`-Tests den
 * Browser-Redirect mit dem echten, vor jedem Stubbing gesicherten `fetch`.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Konfiguration } from '../../shared/konfiguration.ts';
import { mcpPfad } from '../../shared/konfiguration.ts';
import { McpFehler } from '../../ingest/mcp.ts';
import { erwarteRechte } from '../dateirechte.ts';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
// Gemockt statt plattformabhaengig geprueft: WELCHES Programm den Browser oeffnet, ist
// Sache von `browser.ts` und dort getestet. Hier zaehlt allein, dass genau einmal genau
// die Autorisierungsadresse hinausgereicht wird — und das muss auf jeder Plattform gelten,
// auch auf einer ohne Oeffner (Linux in der CI).
vi.mock('../../shared/browser.ts', () => ({ oeffneImBrowser: vi.fn() }));

const { oeffneImBrowser } = await import('../../shared/browser.ts');

const { anmelden, anmeldungAbgeschlossenHtml, atomarSchreiben, mcpTokenVorhanden, registrieren, zugriffstoken } = await import('../../ingest/mcpAnmeldung.ts');

// Dieselben Adressen wie in `mcpAnmeldung.ts` — dort nicht exportiert, hier als Vertrag
// nachgebildet, den die Tests gegen den Transport pruefen.
const REGISTER_URL = 'https://mcp.scalable.capital/register';
const AUTHORIZE_URL = 'https://mcp.scalable.capital/authorize';
const TOKEN_URL = 'https://mcp.scalable.capital/token';
const REDIRECT_URI = 'http://127.0.0.1:8732/callback';

// Vor jedem `vi.stubGlobal('fetch', ...)` gesichert: der echte, unstubbed `fetch`, mit dem die
// beiden `anmelden()`-Tests den Browser-Redirect gegen den wirklich lauschenden lokalen Server simulieren.
const REAL_FETCH = globalThis.fetch;

const tempDirs: string[] = [];

function frischeKonfiguration(): Konfiguration {
  const datenpfad = mkdtempSync(join(tmpdir(), 'mcp-test-'));
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
  };
}

function vorabClientAnlegen(k: Konfiguration, clientId = 'client-vorab'): void {
  mkdirSync(mcpPfad(k), { recursive: true, mode: 0o700 });
  writeFileSync(join(mcpPfad(k), 'client.json'), JSON.stringify({ client_id: clientId, client_name: 'Scapio' }));
}

function vorabTokenAnlegen(k: Konfiguration, token: Record<string, unknown>): void {
  mkdirSync(mcpPfad(k), { recursive: true, mode: 0o700 });
  writeFileSync(join(mcpPfad(k), 'token.json'), JSON.stringify(token));
}

type FetchAufruf = { readonly url: string; readonly optionen: RequestInit };

/** Ersetzt `global.fetch` durch einen Router ueber URL-Praefixe. Jeder Aufruf wird protokolliert. */
function fetchRouter(
  handler: Record<string, (url: string, optionen: RequestInit) => Response | Promise<Response>>,
): { readonly calls: FetchAufruf[] } {
  const calls: FetchAufruf[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (ziel: string | URL, optionen: RequestInit = {}) => {
      const url = String(ziel);
      calls.push({ url, optionen });
      const treffer = Object.entries(handler).find(([praefix]) => url.startsWith(praefix));
      if (treffer === undefined) throw new Error(`Kein Handler fuer ${url} vorbereitet.`);
      return treffer[1](url, optionen);
    }),
  );
  return { calls };
}

function jsonAntwort(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function redirectAntwort(status = 302): Response {
  return new Response(null, { status, headers: { location: 'https://boese.tld/anderswo' } });
}

async function warteBisServerLauscht(): Promise<void> {
  await new Promise((r) => setTimeout(r, 20));
}

/**
 * Simuliert den Browser-Redirect mit dem echten `fetch` gegen den lokal lauschenden Server.
 * `connection: close` erzwingt eine frische TCP-Verbindung je Aufruf — ohne das haelt Node
 * eine Keep-Alive-Verbindung zum Server EINES Tests offen, und der naechste Test (derselbe
 * feste Port) haengt sich an eine tote Verbindung zum laengst geschlossenen alten Server.
 */
async function redirectSimulieren(query: string): Promise<Headers> {
  const antwort = await REAL_FETCH(`${REDIRECT_URI}?${query}`, { headers: { connection: 'close' } });
  await antwort.text();
  return antwort.headers;
}

/**
 * Wie `redirectSimulieren`, aber mit einem frei waehlbaren `Host`-Kopf — fuer den
 * DNS-Rebinding-Test. `fetch` laesst sich der `Host`-Kopf nicht ueberschreiben (verbotener
 * Kopf), deshalb hier direkt `node:http`.
 */
async function redirectMitHost(host: string, query: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const anfrage = http.request(
      { hostname: '127.0.0.1', port: 8732, path: `/callback?${query}`, method: 'GET', headers: { host, connection: 'close' } },
      (antwort) => {
        antwort.resume();
        antwort.on('end', () => resolve(antwort.statusCode ?? 0));
      },
    );
    anfrage.on('error', reject);
    anfrage.end();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(execFile).mockClear();
  vi.mocked(oeffneImBrowser).mockClear();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('registrieren', () => {
  it('schreibt client.json mit 0600-Rechten bei erfolgreicher Registrierung', async () => {
    const k = frischeKonfiguration();
    const { calls } = fetchRouter({ [REGISTER_URL]: () => jsonAntwort(200, { client_id: 'client-abc' }) });

    const client = await registrieren(k);

    expect(client).toEqual({ client_id: 'client-abc', client_name: 'Scapio' });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0]?.optionen.body)).client_name).toBe('Scapio');

    const datei = join(mcpPfad(k), 'client.json');
    expect(JSON.parse(readFileSync(datei, 'utf8'))).toEqual({ client_id: 'client-abc', client_name: 'Scapio' });
    erwarteRechte(datei, 0o600);
  });

  it('setzt beim Lesen einer vorhandenen client.json die Rechte erneut auf 0600', async () => {
    const k = frischeKonfiguration();
    vorabClientAnlegen(k, 'schon-da');
    const datei = join(mcpPfad(k), 'client.json');
    chmodSync(datei, 0o644);
    fetchRouter({});

    await registrieren(k);

    erwarteRechte(datei, 0o600);
  });

  it('liest eine bereits vorhandene client.json erneut ein, statt ein zweites Mal zu registrieren', async () => {
    const k = frischeKonfiguration();
    vorabClientAnlegen(k, 'schon-da');
    const { calls } = fetchRouter({});

    const client = await registrieren(k);

    expect(client).toEqual({ client_id: 'schon-da', client_name: 'Scapio' });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['ohne client_name', { client_id: 'alt' }],
    ['unter altem Namen', { client_id: 'alt', client_name: 'portfolio-dashboard' }],
  ])('registriert neu, wenn client.json %s vorliegt', async (_fall, datei) => {
    const k = frischeKonfiguration();
    mkdirSync(mcpPfad(k), { recursive: true, mode: 0o700 });
    writeFileSync(join(mcpPfad(k), 'client.json'), JSON.stringify(datei));
    const { calls } = fetchRouter({ [REGISTER_URL]: () => jsonAntwort(201, { client_id: 'neu' }) });

    expect(await registrieren(k)).toEqual({ client_id: 'neu', client_name: 'Scapio' });
    expect(calls).toHaveLength(1);
  });

  it('lehnt eine 3xx-Antwort von /register als Fehler ab, statt der Umleitung zu folgen', async () => {
    const k = frischeKonfiguration();
    const { calls } = fetchRouter({ [REGISTER_URL]: () => redirectAntwort(302) });

    const fehler = await registrieren(k).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).code).toBe('E_MCP_ANMELDUNG');
    expect(calls).toHaveLength(1);
  });

  it('meldet eine 5xx-Antwort von /register als voruebergehend, nicht als Anmeldeproblem', async () => {
    const k = frischeKonfiguration();
    fetchRouter({ [REGISTER_URL]: () => new Response(null, { status: 503 }) });

    const fehler = await registrieren(k).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).code).toBe('E_MCP_TRANSIENT');
  });

  it.each([
    ['ohne client_id', { client_name: 'x' }],
    ['mit ueberlanger client_id', { client_id: 'x'.repeat(513) }],
    ['mit client_id als Zahl', { client_id: 42 }],
  ])('lehnt eine Registrierungsantwort %s ab [INV-12]', async (_fall, antwort) => {
    const k = frischeKonfiguration();
    fetchRouter({ [REGISTER_URL]: () => jsonAntwort(201, antwort) });

    const fehler = await registrieren(k).catch((f: unknown) => f);

    expect((fehler as McpFehler).code).toBe('E_MCP_ANMELDUNG');
  });

  it('registriert neu, wenn client.json ein unbekanntes Feld traegt [INV-12]', async () => {
    const k = frischeKonfiguration();
    mkdirSync(mcpPfad(k), { recursive: true, mode: 0o700 });
    writeFileSync(join(mcpPfad(k), 'client.json'), JSON.stringify({ client_id: 'alt', fremd: 1 }));
    fetchRouter({ [REGISTER_URL]: () => jsonAntwort(201, { client_id: 'neu', client_id_issued_at: 1 }) });

    expect((await registrieren(k)).client_id).toBe('neu');
  });

  it('registriert neu, wenn client.json kaputt ist, statt mit einem rohen Parse-Fehler abzubrechen', async () => {
    const k = frischeKonfiguration();
    mkdirSync(mcpPfad(k), { recursive: true, mode: 0o700 });
    writeFileSync(join(mcpPfad(k), 'client.json'), '{ das ist kein JSON');
    const { calls } = fetchRouter({ [REGISTER_URL]: () => jsonAntwort(200, { client_id: 'neu-registriert' }) });

    const client = await registrieren(k);

    expect(client).toEqual({ client_id: 'neu-registriert', client_name: 'Scapio' });
    expect(calls).toHaveLength(1);
  });

  it('bricht nach mcpZeitlimitMs ab, statt endlos zu haengen, und wirft E_MCP_ZEIT', async () => {
    const k = { ...frischeKonfiguration(), mcpZeitlimitMs: 20 };
    vi.stubGlobal(
      'fetch',
      vi.fn((_ziel: string | URL, optionen: RequestInit = {}) => {
        return new Promise<Response>((_resolve, reject) => {
          optionen.signal?.addEventListener('abort', () => {
            const abbruch = new Error('Aborted');
            abbruch.name = 'AbortError';
            reject(abbruch);
          });
        });
      }),
    );

    const fehler = await registrieren(k).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).code).toBe('E_MCP_ZEIT');
  });

  it('haelt das Zeitlimit auch ueber das Lesen des Koerpers, nicht nur bis zu den Kopfzeilen', async () => {
    const k = { ...frischeKonfiguration(), mcpZeitlimitMs: 20 };
    vi.stubGlobal(
      'fetch',
      vi.fn((_ziel: string | URL, optionen: RequestInit = {}) => {
        const koerper = new ReadableStream<Uint8Array>({
          start(steuerung) {
            steuerung.enqueue(new TextEncoder().encode('{"client_id":'));
            optionen.signal?.addEventListener('abort', () => {
              const abbruch = new Error('Aborted');
              abbruch.name = 'AbortError';
              steuerung.error(abbruch);
            });
          },
        });
        return Promise.resolve(new Response(koerper, { status: 200 }));
      }),
    );

    const fehler = await registrieren(k).catch((f: unknown) => f);

    expect((fehler as McpFehler).code).toBe('E_MCP_ZEIT');
  });

  it('bricht ab, statt eine ueberlange /register-Antwort komplett zu puffern', async () => {
    const k = frischeKonfiguration();
    const riesig = JSON.stringify({ client_id: 'x'.repeat(100 * 1024) });
    fetchRouter({
      [REGISTER_URL]: () => new Response(riesig, { status: 200, headers: { 'content-type': 'application/json' } }),
    });

    const fehler = await registrieren(k).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(Error);
    expect((fehler as Error).message).toMatch(/zu gross/);
  });
});

describe('anmelden', () => {
  it('lehnt einen Redirect mit falschem state mit 400 ab und wartet weiter, statt den Login abzubrechen', async () => {
    const k = frischeKonfiguration();
    const { calls } = fetchRouter({
      [REGISTER_URL]: () => jsonAntwort(200, { client_id: 'client-state-test' }),
      [TOKEN_URL]: () => jsonAntwort(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
    });

    const anmeldungPromise = anmelden(k);
    await warteBisServerLauscht();

    const antwort = await REAL_FETCH(`${REDIRECT_URI}?code=irgendein-code&state=falscher-state-wert`, {
      headers: { connection: 'close' },
    });
    await antwort.text();
    expect(antwort.status).toBe(400);
    expect(calls.some((c) => c.url === TOKEN_URL)).toBe(false);

    // Der Server laeuft weiter: der echte Redirect mit dem richtigen state kommt jetzt an
    // und der Login schliesst normal ab — der falsche Treffer davor hat nichts abgebrochen.
    const authUrl = new URL(vi.mocked(oeffneImBrowser).mock.calls[0]![0]);
    const state = authUrl.searchParams.get('state');
    await redirectSimulieren(`code=echter-code&state=${String(state)}`);
    await anmeldungPromise;

    expect(calls.some((c) => c.url === TOKEN_URL)).toBe(true);
  });

  it('lehnt einen Redirect mit falschem Host-Kopf mit 400 ab, ohne den Server zu schliessen [DNS-Rebinding]', async () => {
    const k = frischeKonfiguration();
    const { calls } = fetchRouter({
      [REGISTER_URL]: () => jsonAntwort(200, { client_id: 'client-host-test' }),
      [TOKEN_URL]: () => jsonAntwort(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
    });

    const anmeldungPromise = anmelden(k);
    await warteBisServerLauscht();

    const authUrl = new URL(vi.mocked(oeffneImBrowser).mock.calls[0]![0]);
    const state = authUrl.searchParams.get('state');

    const status = await redirectMitHost('boese.tld:8732', `code=irgendein-code&state=${String(state)}`);
    expect(status).toBe(400);
    expect(calls.some((c) => c.url === TOKEN_URL)).toBe(false);

    // Server laeuft weiter, der echte Redirect (richtiger Host) schliesst den Login ab.
    await redirectSimulieren(`code=echter-code&state=${String(state)}`);
    await anmeldungPromise;
    expect(calls.some((c) => c.url === TOKEN_URL)).toBe(true);
  });

  it('ersetzt einen nicht als OAuth-Fehlercode erkennbaren `error`-Parameter durch einen Platzhalter', async () => {
    const k = frischeKonfiguration();
    fetchRouter({ [REGISTER_URL]: () => jsonAntwort(200, { client_id: 'client-error-test' }) });

    const anmeldungPromise = anmelden(k);
    const anmeldungErgebnis = anmeldungPromise.catch((f: unknown) => f);
    await warteBisServerLauscht();

    const authUrl = new URL(vi.mocked(oeffneImBrowser).mock.calls[0]![0]);
    const state = authUrl.searchParams.get('state');
    // ANSI-Escape/Steuerzeichen-artiger Wert — passt nicht auf `^[a-z_]{1,40}$`.
    const boeserWert = encodeURIComponent('[31mrot[0m; rm -rf');
    await redirectSimulieren(`error=${boeserWert}&state=${String(state)}`);

    const fehler = await anmeldungErgebnis;
    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).message).toContain('unbekannt');
    expect((fehler as McpFehler).message).not.toContain('rm -rf');
  });

  it('uebernimmt einen echten OAuth-Fehlercode unveraendert in die Meldung', async () => {
    const k = frischeKonfiguration();
    fetchRouter({ [REGISTER_URL]: () => jsonAntwort(200, { client_id: 'client-error-test-2' }) });

    const anmeldungPromise = anmelden(k);
    const anmeldungErgebnis = anmeldungPromise.catch((f: unknown) => f);
    await warteBisServerLauscht();

    const authUrl = new URL(vi.mocked(oeffneImBrowser).mock.calls[0]![0]);
    const state = authUrl.searchParams.get('state');
    await redirectSimulieren(`error=access_denied&state=${String(state)}`);

    const fehler = await anmeldungErgebnis;
    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).message).toContain('access_denied');
  });

  it('fuehrt den vollen PKCE-Fluss durch: korrekte code_challenge, echter Redirect, Token-Datei 0600', async () => {
    const k = frischeKonfiguration();
    const meldungen: string[] = [];
    const { calls } = fetchRouter({
      [REGISTER_URL]: () => jsonAntwort(200, { client_id: 'client-happy' }),
      [TOKEN_URL]: () =>
        jsonAntwort(200, { access_token: 'GEHEIM-access-xyz123', refresh_token: 'refresh-happy', expires_in: 3600 }),
    });

    const anmeldungPromise = anmelden(k, { melde: (text) => meldungen.push(text) });
    await warteBisServerLauscht();

    // Browser waere echt geoeffnet worden — hier nur der gemockte Oeffner. Kein
    // Kindprozess, auf keiner Plattform.
    expect(oeffneImBrowser).toHaveBeenCalledTimes(1);
    expect(execFile).not.toHaveBeenCalled();
    const authUrl = new URL(vi.mocked(oeffneImBrowser).mock.calls[0]![0]);
    expect(authUrl.origin + authUrl.pathname).toBe(AUTHORIZE_URL);
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    // Geht der Browser nicht auf, steht die Adresse zum Kopieren auf der Konsole.
    expect(meldungen.some((m) => m.includes(authUrl.toString()))).toBe(true);

    const challenge = authUrl.searchParams.get('code_challenge');
    const state = authUrl.searchParams.get('state');
    expect(challenge).toBeTruthy();
    expect(state).toBeTruthy();

    const kopf = await redirectSimulieren(`code=test-autorisierungscode&state=${String(state)}`);
    expect(kopf.get('content-security-policy')).toMatch(/^default-src 'none'/);
    expect(kopf.get('content-security-policy')).not.toContain('script-src');
    expect(kopf.get('referrer-policy')).toBe('no-referrer');
    expect(kopf.get('cache-control')).toBe('no-store');

    await anmeldungPromise;

    // PKCE-Beziehung selbst nachrechnen: code_challenge = base64url(sha256(code_verifier)),
    // wobei code_verifier derselbe Wert ist, der im /token-Koerper steckt.
    const tokenAufruf = calls.find((c) => c.url === TOKEN_URL);
    expect(tokenAufruf).toBeDefined();
    const body = tokenAufruf!.optionen.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('test-autorisierungscode');

    const verifier = body.get('code_verifier');
    expect(verifier).toBeTruthy();
    const erwarteteChallenge = createHash('sha256')
      .update(verifier!)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(challenge).toBe(erwarteteChallenge);

    const tokenDatei = join(mcpPfad(k), 'token.json');
    erwarteRechte(tokenDatei, 0o600);
    const inhalt = JSON.parse(readFileSync(tokenDatei, 'utf8'));
    expect(inhalt.access_token).toBe('GEHEIM-access-xyz123');

    expect(meldungen.some((m) => m.includes('Anmeldung erfolgreich'))).toBe(true);
  });

  it('bricht den Token-Tausch nach mcpZeitlimitMs ab und wirft E_MCP_ZEIT, ohne den Redirect zu blockieren', async () => {
    const k = { ...frischeKonfiguration(), mcpZeitlimitMs: 20 };
    fetchRouter({
      [REGISTER_URL]: () => jsonAntwort(200, { client_id: 'client-zeit-test' }),
      [TOKEN_URL]: (_url, optionen) =>
        new Promise<Response>((_resolve, reject) => {
          optionen.signal?.addEventListener('abort', () => {
            const abbruch = new Error('Aborted');
            abbruch.name = 'AbortError';
            reject(abbruch);
          });
        }),
    });

    const anmeldungPromise = anmelden(k);
    const anmeldungErgebnis = anmeldungPromise.catch((f: unknown) => f);
    await warteBisServerLauscht();

    const authUrl = new URL(vi.mocked(oeffneImBrowser).mock.calls[0]![0]);
    const state = authUrl.searchParams.get('state');
    // Der lokale Server antwortet dem Browser und schliesst, bevor der Token-Tausch
    // beginnt — der Redirect kehrt also normal zurueck, obwohl der Tausch selbst haengt.
    await redirectSimulieren(`code=irgendein-code&state=${String(state)}`);

    const fehler = await anmeldungErgebnis;
    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).code).toBe('E_MCP_ZEIT');
  });
});

describe('zugriffstoken', () => {
  it('gibt den zwischengespeicherten access_token zurueck, wenn er noch nicht abgelaufen ist', async () => {
    const k = frischeKonfiguration();
    vorabTokenAnlegen(k, { access_token: 'noch-gueltig', refresh_token: 'r1', expires_in: 3600, geholtUm: Date.now() });
    const { calls } = fetchRouter({});

    const token = await zugriffstoken(k);

    expect(token).toBe('noch-gueltig');
    expect(calls).toHaveLength(0);
  });

  it('tauscht still gegen den Refresh-Token, wenn der Zugriffstoken abgelaufen ist', async () => {
    const k = frischeKonfiguration();
    vorabClientAnlegen(k, 'client-refresh');
    // `geholtUm: 0` mit kurzem `expires_in`: laengst abgelaufen.
    vorabTokenAnlegen(k, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    const { calls } = fetchRouter({
      [TOKEN_URL]: () => jsonAntwort(200, { access_token: 'neu', refresh_token: 'r-neu', expires_in: 3600 }),
    });

    const token = await zugriffstoken(k);

    expect(token).toBe('neu');
    expect(calls).toHaveLength(1);
    const tokenDatei = join(mcpPfad(k), 'token.json');
    const gespeichert = JSON.parse(readFileSync(tokenDatei, 'utf8'));
    expect(gespeichert.refresh_token).toBe('r-neu');
    erwarteRechte(tokenDatei, 0o600);
  });

  it('tauscht auch mit einer client.json ohne client_name, ohne neu zu registrieren', async () => {
    const k = frischeKonfiguration();
    mkdirSync(mcpPfad(k), { recursive: true, mode: 0o700 });
    writeFileSync(join(mcpPfad(k), 'client.json'), JSON.stringify({ client_id: 'client-alt' }));
    vorabTokenAnlegen(k, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    const { calls } = fetchRouter({ [TOKEN_URL]: () => jsonAntwort(200, { access_token: 'neu', expires_in: 3600 }) });

    expect(await zugriffstoken(k)).toBe('neu');
    expect(calls.map((c) => c.url)).toEqual([TOKEN_URL]);
    expect(new URLSearchParams(String(calls[0]?.optionen.body)).get('client_id')).toBe('client-alt');
  });

  it('wirft E_MCP_ANMELDUNG, wenn kein token.json existiert', async () => {
    const k = frischeKonfiguration();
    fetchRouter({});

    const fehler = await zugriffstoken(k).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).code).toBe('E_MCP_ANMELDUNG');
  });

  it('wirft E_MCP_ANMELDUNG, wenn der abgelaufene Token keinen refresh_token hat', async () => {
    const k = frischeKonfiguration();
    vorabTokenAnlegen(k, { access_token: 'alt', expires_in: 60, geholtUm: 0 });
    fetchRouter({});

    const fehler = await zugriffstoken(k).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).code).toBe('E_MCP_ANMELDUNG');
  });

  it('wirft E_MCP_ANMELDUNG, wenn der stille Refresh abgelehnt wird', async () => {
    const k = frischeKonfiguration();
    vorabClientAnlegen(k);
    vorabTokenAnlegen(k, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    fetchRouter({ [TOKEN_URL]: () => new Response(null, { status: 400 }) });

    const fehler = await zugriffstoken(k).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).code).toBe('E_MCP_ANMELDUNG');
  });

  it('folgt keiner Umleitung beim stillen Refresh, sondern wirft E_MCP_ANMELDUNG', async () => {
    const k = frischeKonfiguration();
    vorabClientAnlegen(k);
    vorabTokenAnlegen(k, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    const { calls } = fetchRouter({ [TOKEN_URL]: () => redirectAntwort(302) });

    const fehler = await zugriffstoken(k).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).code).toBe('E_MCP_ANMELDUNG');
    expect(calls.filter((c) => c.url === TOKEN_URL)).toHaveLength(1);
  });

  it('behaelt den alten refresh_token, wenn die Refresh-Antwort keinen neuen mitschickt', async () => {
    const k = frischeKonfiguration();
    vorabClientAnlegen(k);
    vorabTokenAnlegen(k, { access_token: 'alt', refresh_token: 'r-bleibt', expires_in: 60, geholtUm: 0 });
    fetchRouter({ [TOKEN_URL]: () => jsonAntwort(200, { access_token: 'neu2', expires_in: 3600 }) });

    await zugriffstoken(k);

    const gespeichert = JSON.parse(readFileSync(join(mcpPfad(k), 'token.json'), 'utf8'));
    expect(gespeichert.refresh_token).toBe('r-bleibt');
  });

  it('akzeptiert eine Token-Antwort mit zusaetzlichen OIDC-Feldern (id_token, scope)', async () => {
    // Der angeforderte Scope enthaelt `openid` — eine echte Gegenstelle liefert dafuer
    // OIDC-typisch `id_token` und `scope` mit, die hier niemand braucht. Das Schema darf
    // sie nur verwerfen, nicht die ganze Antwort ablehnen.
    const k = frischeKonfiguration();
    vorabClientAnlegen(k);
    vorabTokenAnlegen(k, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    fetchRouter({
      [TOKEN_URL]: () =>
        jsonAntwort(200, {
          access_token: 'neu',
          refresh_token: 'r-neu',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'openid profile offline_access',
          id_token: 'kopf.nutzlast.signatur',
        }),
    });

    const token = await zugriffstoken(k);

    expect(token).toBe('neu');
    const gespeichert = JSON.parse(readFileSync(join(mcpPfad(k), 'token.json'), 'utf8'));
    expect(gespeichert.id_token).toBeUndefined();
  });

  it('unterscheidet eine definitive 401-invalid_grant-Ablehnung von einem 5xx-Fehler [E_MCP_TRANSIENT]', async () => {
    const kDefinitiv = frischeKonfiguration();
    vorabClientAnlegen(kDefinitiv);
    vorabTokenAnlegen(kDefinitiv, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    fetchRouter({ [TOKEN_URL]: () => jsonAntwort(401, { error: 'invalid_grant' }) });

    const definitiverFehler = await zugriffstoken(kDefinitiv).catch((f: unknown) => f);
    expect(definitiverFehler).toBeInstanceOf(McpFehler);
    expect((definitiverFehler as McpFehler).code).toBe('E_MCP_ANMELDUNG');

    const kTransient = frischeKonfiguration();
    vorabClientAnlegen(kTransient);
    vorabTokenAnlegen(kTransient, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    fetchRouter({ [TOKEN_URL]: () => new Response(null, { status: 503 }) });

    const transienterFehler = await zugriffstoken(kTransient).catch((f: unknown) => f);
    expect(transienterFehler).toBeInstanceOf(McpFehler);
    expect((transienterFehler as McpFehler).code).toBe('E_MCP_TRANSIENT');
  });

  it('meldet einen Netzwerkfehler beim stillen Refresh als voruebergehend, nicht als Anmeldeproblem', async () => {
    const k = frischeKonfiguration();
    vorabClientAnlegen(k);
    vorabTokenAnlegen(k, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (ziel: string | URL) => {
        if (String(ziel) === TOKEN_URL) throw new Error('ECONNREFUSED');
        throw new Error(`Kein Handler fuer ${String(ziel)} vorbereitet.`);
      }),
    );

    const fehler = await zugriffstoken(k).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).code).toBe('E_MCP_TRANSIENT');
  });

  it('bricht den stillen Refresh nach mcpZeitlimitMs ab und wirft E_MCP_ZEIT', async () => {
    const k = { ...frischeKonfiguration(), mcpZeitlimitMs: 20 };
    vorabClientAnlegen(k);
    vorabTokenAnlegen(k, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    fetchRouter({
      [TOKEN_URL]: (_url, optionen) =>
        new Promise<Response>((_resolve, reject) => {
          optionen.signal?.addEventListener('abort', () => {
            const abbruch = new Error('Aborted');
            abbruch.name = 'AbortError';
            reject(abbruch);
          });
        }),
    });

    const fehler = await zugriffstoken(k).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).code).toBe('E_MCP_ZEIT');
  });

  it('teilt parallelen Aufrufen einen einzigen Refresh zu, statt den Refresh-Token doppelt einzuloesen', async () => {
    const k = frischeKonfiguration();
    vorabClientAnlegen(k);
    vorabTokenAnlegen(k, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    const { calls } = fetchRouter({
      [TOKEN_URL]: () => jsonAntwort(200, { access_token: 'neu', refresh_token: 'r-neu', expires_in: 3600 }),
    });

    const tokens = await Promise.all([zugriffstoken(k), zugriffstoken(k), zugriffstoken(k)]);

    expect(tokens).toEqual(['neu', 'neu', 'neu']);
    expect(calls).toHaveLength(1);
  });

  it('registriert beim Refresh keinen neuen Client, wenn client.json fehlt, sondern verlangt eine Anmeldung', async () => {
    const k = frischeKonfiguration();
    vorabTokenAnlegen(k, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    const { calls } = fetchRouter({});

    const fehler = await zugriffstoken(k).catch((f: unknown) => f);

    expect((fehler as McpFehler).code).toBe('E_MCP_ANMELDUNG');
    expect(calls).toHaveLength(0);
  });

  it('lehnt eine Refresh-Antwort ab, die nicht dem Tokenschema entspricht [INV-12]', async () => {
    const k = frischeKonfiguration();
    vorabClientAnlegen(k);
    vorabTokenAnlegen(k, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    // `expires_in` als Zeichenkette statt Zahl — passt nicht auf das Schema.
    fetchRouter({ [TOKEN_URL]: () => jsonAntwort(200, { access_token: 'neu', expires_in: 'bald' }) });

    const fehler = await zugriffstoken(k).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).code).toBe('E_MCP_ANMELDUNG');
  });

  it('behandelt eine kaputte/manipulierte token.json wie einen fehlenden Token, statt zu werfen', async () => {
    const k = frischeKonfiguration();
    mkdirSync(mcpPfad(k), { recursive: true, mode: 0o700 });
    // Gueltiges JSON, aber `expires_in` negativ — verletzt das Schema.
    writeFileSync(join(mcpPfad(k), 'token.json'), JSON.stringify({ access_token: 'x', expires_in: -5, geholtUm: 0 }));
    fetchRouter({});

    const fehler = await zugriffstoken(k).catch((f: unknown) => f);

    expect(fehler).toBeInstanceOf(McpFehler);
    expect((fehler as McpFehler).code).toBe('E_MCP_ANMELDUNG');
  });

  it('schreibt token.json atomar: keine liegen gebliebene temporaere Datei danach', async () => {
    const k = frischeKonfiguration();
    vorabClientAnlegen(k);
    vorabTokenAnlegen(k, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    fetchRouter({ [TOKEN_URL]: () => jsonAntwort(200, { access_token: 'neu', refresh_token: 'r-neu', expires_in: 3600 }) });

    await zugriffstoken(k);

    const dateien = readdirSync(mcpPfad(k));
    expect(dateien).toEqual(expect.arrayContaining(['token.json']));
    expect(dateien.some((d) => d.endsWith('.tmp'))).toBe(false);
  });
});

describe('mcpTokenVorhanden', () => {
  it('gibt false zurueck, wenn noch kein Token gespeichert ist', () => {
    const k = frischeKonfiguration();
    expect(mcpTokenVorhanden(k)).toBe(false);
  });

  it('gibt true zurueck, sobald ein Token gespeichert ist', () => {
    const k = frischeKonfiguration();
    vorabTokenAnlegen(k, { access_token: 'irgendein-token', expires_in: 3600, geholtUm: Date.now() });

    expect(mcpTokenVorhanden(k)).toBe(true);
  });
});

describe('Geheimnisschutz', () => {
  it('der Tokenwert taucht nie in einer Fehlermeldung oder einer Konsolenausgabe auf', async () => {
    const GEHEIM = 'GEHEIM-access-xyz123';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const gesammelteFehler: string[] = [];

    // Erfolgreicher Refresh, bei dem der neue access_token bewusst der Geheimwert ist.
    const k1 = frischeKonfiguration();
    vorabClientAnlegen(k1);
    vorabTokenAnlegen(k1, { access_token: 'alt', refresh_token: 'r-alt', expires_in: 60, geholtUm: 0 });
    fetchRouter({
      [TOKEN_URL]: () => jsonAntwort(200, { access_token: GEHEIM, refresh_token: 'r-neu', expires_in: 3600 }),
    });
    const ergebnis = await zugriffstoken(k1);
    expect(ergebnis).toBe(GEHEIM); // die Funktion selbst gibt ihn zurueck — nur Fehler/Konsole duerfen ihn nie zeigen.

    // Ein abgelehnter Refresh, dessen (hypothetischer) Antwortkoerper den Geheimwert zitiert —
    // die Fehlermeldung darf ihn trotzdem nicht uebernehmen (sie nennt nur den Status).
    const k2 = frischeKonfiguration();
    vorabClientAnlegen(k2);
    vorabTokenAnlegen(k2, { access_token: 'alt2', refresh_token: 'r-alt2', expires_in: 60, geholtUm: 0 });
    fetchRouter({ [TOKEN_URL]: () => jsonAntwort(400, { error: 'invalid_grant', hinweis: GEHEIM }) });
    try {
      await zugriffstoken(k2);
      expect.unreachable('haette werfen muessen');
    } catch (fehler) {
      gesammelteFehler.push((fehler as Error).message);
    }

    const konsolenAusgaben = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((wert) => String(wert));

    for (const ausgabe of [...konsolenAusgaben, ...gesammelteFehler]) {
      expect(ausgabe).not.toContain(GEHEIM);
    }

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe('atomarSchreiben', () => {
  it('schreibt mit 0600, ersetzt den Inhalt und laesst keine temporaere Datei liegen', () => {
    const k = frischeKonfiguration();
    const datei = join(k.datenpfad, 'x.json');

    atomarSchreiben(datei, '{"a":1}');
    atomarSchreiben(datei, '{"a":2}');

    expect(readFileSync(datei, 'utf8')).toBe('{"a":2}');
    erwarteRechte(datei, 0o600);
    expect(readdirSync(k.datenpfad)).toEqual(['x.json']);
  });

  it('raeumt die temporaere Datei auf, wenn das Umbenennen scheitert', () => {
    const k = frischeKonfiguration();
    const ziel = join(k.datenpfad, 'verzeichnis');
    mkdirSync(ziel);

    expect(() => atomarSchreiben(ziel, 'x')).toThrow();

    expect(readdirSync(k.datenpfad)).toEqual(['verzeichnis']);
  });
});

describe('anmeldungAbgeschlossenHtml [ADR-039]', () => {
  it('ohne folgendes Dashboard: nur der Hinweis zum Schliessen, kein Fortschritt', () => {
    const html = anmeldungAbgeschlossenHtml();
    expect(html).toContain('Dieses Fenster kann geschlossen werden.');
    expect(html).not.toContain('role="progressbar"');
  });

  it('mit folgendem Dashboard: unbestimmter Fortschritt statt Knopf oder Link', () => {
    const html = anmeldungAbgeschlossenHtml(true);
    expect(html).toContain('öffnet sich gleich in einem neuen Tab');
    expect(html).toContain('role="progressbar"');
    expect(html).not.toContain('<a ');
  });
});
