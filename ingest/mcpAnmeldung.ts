/**
 * Direkte OAuth/PKCE-Anmeldung am Scalable-MCP — ohne Claude-Code-Kindprozess. [ADR-010]
 *
 * Ein eigener, per Dynamic Client Registration angemeldeter OAuth-Client holt sich per
 * PKCE (Autorisierungscode + lokaler Redirect-Listener auf `127.0.0.1`) einen
 * access_token/refresh_token und legt beide unter `<datenpfad>/mcp/` ab — Verzeichnis
 * `0700`, Datei `0600`, dasselbe Vertrauensmodell wie `db/verbindung.ts` fuer die
 * Datenbank.
 *
 * Zwei Einstiege:
 *   - `registrieren()` + `anmelden()`: einmalig, interaktiv, oeffnet den Browser
 *     (`npm run mcp-login`, `start/mcpLogin.ts`).
 *   - `zugriffstoken(k)`: bei jedem Ingest-Lauf. Tauscht still gegen den Refresh-Token,
 *     wenn der Zugriffstoken abgelaufen ist. Schlaegt das fehl, wirft sie
 *     `McpFehler('E_MCP_ANMELDUNG', ...)` — sie oeffnet NIE von selbst einen Browser.
 *     Eine 4xx-Ablehnung (Refresh-Token widerrufen o.ae.) ist dabei `E_MCP_ANMELDUNG`
 *     (dauerhaft, nur `npm run mcp-login` hilft); ein 5xx oder ein Netzwerkfehler ist
 *     `E_MCP_TRANSIENT` (voruebergehend, kein Grund fuer eine neue Anmeldung).
 *
 * Alle drei Endpunkte sind feste Code-Konstanten unter `https://mcp.scalable.capital`,
 * nicht Teil von `erlaubteHosts` — diese Adresse ist kein Konfigurationswert.
 *
 * Der Tokenwert selbst erscheint nie in einer geworfenen Fehlermeldung und nie in einer
 * Konsolenausgabe dieses Moduls — nur Status, Fehlercode, Zeitstempel.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { z } from 'zod';
import type { Konfiguration } from '../shared/konfiguration.ts';
import { mcpPfad, mcpTokenPfad } from '../shared/konfiguration.ts';
import { atomarSchreiben, eigeneDatei, verzeichnisAnlegen } from '../shared/dateirechte.ts';
import { oeffneImBrowser } from '../shared/browser.ts';
import { HAKEN, statusseite } from '../shared/statusseite.ts';
import { McpFehler, mcpSitzungVergessen } from './mcp.ts';
import { holeMitZeitlimit, NetzFehler, type GeleseneAntwort } from './netz.ts';

const BASIS = 'https://mcp.scalable.capital';
const REGISTER_URL = `${BASIS}/register`;
const AUTHORIZE_URL = `${BASIS}/authorize`;
const TOKEN_URL = `${BASIS}/token`;

const REDIRECT_PORT = 8732;
const REDIRECT_URI = `http://127.0.0.1:${String(REDIRECT_PORT)}/callback`;
// Erscheint auf Scalables Zustimmungsseite. Aendert er sich, registriert `registrieren()` neu.
const CLIENT_NAME = 'Scapio';

/**
 * Auch nach einer Ablehnung gezeigt — daher "abgeschlossen", nicht "erfolgreich".
 * `dashboardFolgt` nur, wenn gleich danach das Dashboard startet: Sonst stuende der Nutzer
 * vor einer fertigen Seite, waehrend der Fortschritt in einem Terminal im Hintergrund laeuft.
 */
export function anmeldungAbgeschlossenHtml(dashboardFolgt = false): string {
  return statusseite({
    titel: 'Anmeldung abgeschlossen',
    ton: 'gewinn',
    symbol: HAKEN,
    ueberschrift: 'Anmeldung abgeschlossen',
    ...(dashboardFolgt
      ? { text: 'Scapio startet jetzt und öffnet sich gleich in einem neuen Tab. Dieses Tab kann danach geschlossen werden.', fortschritt: 'Scapio startet' }
      : { text: 'Dieses Fenster kann geschlossen werden.' }),
  });
}

/**
 * Die einzige HTML-Antwort ausserhalb von `server/sicherheit.ts`. Die Seite hat kein Skript;
 * Stil und Schrift stehen inline, deshalb nur diese beiden Ausnahmen.
 */
export const RUECKRUF_KOPFZEILEN: Readonly<Record<string, string>> = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

const SCOPE = 'openid profile offline_access';

// Sicherheitsabstand vor dem tatsaechlichen Ablauf: ein Aufruf, der genau in diesem
// Moment beginnt, soll nicht mit einem inzwischen abgelaufenen Token scheitern.
const ABLAUF_SICHERHEITSABSTAND_MS = 30_000;
const AUTHORIZE_ZEITLIMIT_MS = 5 * 60 * 1000;

function b64url(puffer: Buffer): string {
  return puffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Registrierungsantwort (RFC 7591) bringt weitere Felder mit, `client.json` nur diese. [INV-12]
// `client_name` fehlt in Dateien von vor seiner Einfuehrung — die gelten fuer den Refresh weiter.
const RegistrierungSchema = z.object({ client_id: z.string().min(1).max(512) });
const ClientDateiSchema = RegistrierungSchema.extend({ client_name: z.string().min(1).max(200).optional() }).strict();
type Client = z.infer<typeof ClientDateiSchema>;

// Fremde Antwort (Scalables Token-Endpunkt), deshalb zod statt eines blossen Typs. [INV-12]
// Obergrenzen sind grosszuegig, aber real: ein Token ist kein mehrseitiges Dokument, und
// `expires_in` ist eine Lebensdauer in Sekunden, keine Kalenderspanne.
//
// Bewusst NICHT `.strict()`: der angeforderte Scope enthaelt `openid`, also liefert die
// Gegenstelle OIDC-typisch zusaetzliche Felder wie `id_token` oder `scope` mit, die hier
// niemand braucht. `.strict()` liess deswegen jede echte Anmeldung an einem Feld scheitern,
// das kein Test kennt (Tests mocken nur die vier bekannten Felder). Unbekannte Felder werden
// von zod ohne `.strict()` stillschweigend verworfen, nicht durchgereicht — das reicht fuer
// INV-12: die bekannten Felder werden weiterhin geprueft.
const TokenFelder = {
  access_token: z.string().min(1).max(8192),
  refresh_token: z.string().min(1).max(8192).optional(),
  expires_in: z
    .number()
    .int()
    .positive()
    .max(2_592_000) // 30 Tage — ueblich sind Stunden, das ist bereits grosszuegig.
    .optional(),
  token_type: z.string().min(1).max(64).optional(),
};

const TokenAntwortSchema = z.object(TokenFelder);
const GespeicherterTokenSchema = z.object({ ...TokenFelder, geholtUm: z.number().int().nonnegative() });

type TokenSatz = z.infer<typeof TokenAntwortSchema>;
type GespeicherterToken = z.infer<typeof GespeicherterTokenSchema>;

function clientDatei(k: Konfiguration): string {
  return join(mcpPfad(k), 'client.json');
}

function tokenDatei(k: Konfiguration): string {
  return mcpTokenPfad(k);
}

/**
 * Existiert bereits ein gespeicherter Token? Reine Dateipruefung ohne Netzwerkzugriff —
 * fuer `npm run mcp-login -- --nur-wenn-noetig`, mit dem `Start.command`/`.bat` die
 * Anmeldung vorschalten, ohne selbst den Datenpfad zu kennen (der ist ueber `config.json`
 * konfigurierbar).
 */
export function mcpTokenVorhanden(k: Konfiguration): boolean {
  return existsSync(tokenDatei(k));
}

// Registrierungs- und Token-Antworten sind kurze JSON-Objekte (ein Client oder ein Token
// samt OIDC-Beiwerk wie `id_token`) — 64 KiB ist grosszuegig. Ohne Grenze puffert `text()`
// jede Antwortgroesse unbegrenzt im Speicher, bevor ueberhaupt geparst wird.
const ANTWORT_GRENZE_BYTES = 64 * 1024;

function alsJson({ text }: GeleseneAntwort): unknown {
  if (text.length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Der abgelegte Client, oder `null`, wenn `client.json` fehlt, kaputt ist oder nicht passt. */
function gespeicherterClient(k: Konfiguration): Client | null {
  const datei = clientDatei(k);
  if (!eigeneDatei(datei)) return null;
  try {
    const ergebnis = ClientDateiSchema.safeParse(JSON.parse(readFileSync(datei, 'utf8')));
    return ergebnis.success ? ergebnis.data : null;
  } catch {
    return null;
  }
}

/**
 * Registriert einen neuen OAuth-Client bei Scalable (Dynamic Client Registration) oder
 * liest den bereits abgelegten. `redirect: 'manual'`: eine Umleitung waere hier anomal
 * und wird als Fehler behandelt, nie automatisch verfolgt.
 */
export async function registrieren(k: Konfiguration): Promise<Client> {
  // Kaputte oder unlesbare client.json: wie "nicht vorhanden" behandeln und neu
  // registrieren, statt mit einem rohen SyntaxError abzubrechen. Ein Client unter anderem
  // Namen ebenso — der Name auf der Zustimmungsseite steht in Scalables Registrierung fest.
  const vorhanden = gespeicherterClient(k);
  if (vorhanden?.client_name === CLIENT_NAME) return vorhanden;

  verzeichnisAnlegen(mcpPfad(k));

  let antwort: GeleseneAntwort;
  try {
    antwort = await holeMitZeitlimit(
      REGISTER_URL,
      {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: CLIENT_NAME,
          redirect_uris: [REDIRECT_URI],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          scope: SCOPE,
        }),
      },
      k.mcpZeitlimitMs,
      ANTWORT_GRENZE_BYTES,
    );
  } catch (fehler) {
    if (fehler instanceof NetzFehler) throw fehler;
    if ((fehler as Error).name === 'AbortError') {
      throw new McpFehler('E_MCP_ZEIT', '-', `Registrierung: Zeitlimit von ${String(k.mcpZeitlimitMs)} ms ueberschritten.`);
    }
    throw new McpFehler('E_MCP_TRANSIENT', '-', 'Registrierung beim MCP fehlgeschlagen: Netzwerkfehler.');
  }

  if (antwort.status >= 300 && antwort.status < 400) {
    throw new McpFehler('E_MCP_ANMELDUNG', '-', `Registrierung: unerwartete Umleitung (Status ${String(antwort.status)}).`);
  }
  // Ein 5xx ist ein Problem der Gegenstelle, keine Ablehnung dieses Clients — das
  // rechtfertigt keine neue interaktive Anmeldung, nur einen spaeteren Versuch.
  if (antwort.status >= 500) {
    throw new McpFehler('E_MCP_TRANSIENT', '-', `Registrierung voruebergehend fehlgeschlagen (Status ${String(antwort.status)}).`);
  }
  if (!antwort.ok) {
    throw new McpFehler('E_MCP_ANMELDUNG', '-', `Registrierung fehlgeschlagen (Status ${String(antwort.status)}).`);
  }

  const ergebnis = RegistrierungSchema.safeParse(alsJson(antwort));
  if (!ergebnis.success) {
    throw new McpFehler('E_MCP_ANMELDUNG', '-', 'Registrierung: Antwort ohne gueltige client_id.');
  }

  const client: Client = { client_id: ergebnis.data.client_id, client_name: CLIENT_NAME };
  atomarSchreiben(clientDatei(k), JSON.stringify(client, null, 2));
  return client;
}

function tokenSchreiben(k: Konfiguration, token: GespeicherterToken): void {
  verzeichnisAnlegen(mcpPfad(k));
  atomarSchreiben(tokenDatei(k), JSON.stringify(token, null, 2));
}

async function codeGegenToken(client: Client, code: string, verifier: string, zeitlimitMs: number): Promise<TokenSatz> {
  let antwort: GeleseneAntwort;
  try {
    antwort = await holeMitZeitlimit(
      TOKEN_URL,
      {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: client.client_id,
          code_verifier: verifier,
        }),
      },
      zeitlimitMs,
      ANTWORT_GRENZE_BYTES,
    );
  } catch (fehler) {
    if (fehler instanceof NetzFehler) throw fehler;
    if ((fehler as Error).name === 'AbortError') {
      throw new McpFehler('E_MCP_ZEIT', '-', `Token-Tausch: Zeitlimit von ${String(zeitlimitMs)} ms ueberschritten.`);
    }
    throw new McpFehler('E_MCP_TRANSIENT', '-', 'Token-Tausch fehlgeschlagen: Netzwerkfehler.');
  }

  if (antwort.status >= 300 && antwort.status < 400) {
    throw new McpFehler('E_MCP_ANMELDUNG', '-', `Token-Tausch: unerwartete Umleitung (Status ${String(antwort.status)}).`);
  }
  if (antwort.status >= 500) {
    throw new McpFehler('E_MCP_TRANSIENT', '-', `Token-Tausch voruebergehend fehlgeschlagen (Status ${String(antwort.status)}).`);
  }
  if (!antwort.ok) {
    throw new McpFehler('E_MCP_ANMELDUNG', '-', `Token-Tausch fehlgeschlagen (Status ${String(antwort.status)}).`);
  }

  const json = alsJson(antwort);
  const ergebnis = TokenAntwortSchema.safeParse(json);
  if (!ergebnis.success) {
    throw new McpFehler('E_MCP_ANMELDUNG', '-', 'Token-Tausch: Antwort entspricht nicht dem erwarteten Schema.');
  }
  return ergebnis.data;
}

/** Zeitkonstant, damit die Antwortzeit nichts ueber ein teilweise richtiges `state` verraet. */
function stateStimmt(erhalten: string | null, erwartet: string): boolean {
  if (erhalten === null) return false;
  const a = Buffer.from(erhalten);
  const b = Buffer.from(erwartet);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * PKCE-Login: oeffnet den Browser, wartet auf den Redirect nach `127.0.0.1`, tauscht den
 * Autorisierungscode gegen Tokens und speichert sie. Interaktiv, einmalig — ruft nie aus
 * dem normalen Ingest-Lauf heraus auf.
 */
export async function anmelden(
  k: Konfiguration,
  optionen: { readonly melde?: (text: string) => void; readonly dashboardFolgt?: boolean } = {},
): Promise<void> {
  const client = await registrieren(k);
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));

  const authUrl = new URL(AUTHORIZE_URL);
  authUrl.searchParams.set('client_id', client.client_id);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', SCOPE);

  // Wortlaut der echten Adresse, auf der dieser Server lauscht — nur GENAU dieser Host-Kopf
  // gilt als "das ist der Redirect, den wir erwarten". Ohne diese Pruefung koennte jede
  // andere im Browser offene Seite (oder ein lokaler Prozess) denselben Port treffen. [DNS-Rebinding]
  const erwarteterHost = `127.0.0.1:${String(REDIRECT_PORT)}`;
  // OAuth-Fehlercodes sind exakt dieser Form (`access_denied`, `invalid_request`, …) —
  // alles andere ist kein echter Code, sondern potenziell ANSI-Escape-Injection ueber
  // einen fremden, lokal erreichbaren Query-Parameter und wird durch einen Platzhalter ersetzt.
  const FEHLERCODE_MUSTER = /^[a-z_]{1,40}$/;

  const code = await new Promise<string>((erfuellen, ablehnen) => {
    const server = http.createServer((anfrage, antwort) => {
      const url = new URL(anfrage.url ?? '/', REDIRECT_URI);
      if (url.pathname !== '/callback') {
        antwort.writeHead(404).end();
        return;
      }

      // Erst der Host: eine fremde Seite im selben Browser kann diesen Port ebenfalls
      // treffen. Ohne passenden Host-Kopf 400, OHNE den Server zu schliessen — der
      // echte Redirect von Scalable steht ja noch aus. Keine Einzelheit in der Antwort.
      const host = (anfrage.headers.host ?? '').toLowerCase();
      if (host !== erwarteterHost) {
        antwort.writeHead(400).end();
        return;
      }

      // Erst NACH dem Host-Check zaehlt der state — er ist das eigentliche Geheimnis,
      // das diesen Redirect als "unsere Anfrage" ausweist. Passt er nicht, ist das ein
      // verstreuter oder gefaelschter Treffer: 400, Server bleibt offen, kein Abbruch
      // des laufenden Logins.
      if (!stateStimmt(url.searchParams.get('state'), state)) {
        antwort.writeHead(400).end();
        return;
      }

      // Ab hier: Host und state stimmen — das ist der echte Redirect von Scalable,
      // erfolgreich oder abgelehnt. Der Login-Versuch gilt jetzt als abgeschlossen,
      // die Erfolgsseite darf gezeigt und der Server geschlossen werden.
      antwort.writeHead(200, RUECKRUF_KOPFZEILEN);
      const fehlerParamRoh = url.searchParams.get('error');
      antwort.end(anmeldungAbgeschlossenHtml(optionen.dashboardFolgt === true && fehlerParamRoh === null));
      server.close();

      if (fehlerParamRoh !== null) {
        const fehlerParam = FEHLERCODE_MUSTER.test(fehlerParamRoh) ? fehlerParamRoh : 'unbekannt';
        ablehnen(new McpFehler('E_MCP_ANMELDUNG', '-', `Autorisierung abgelehnt: ${fehlerParam}.`));
        return;
      }
      const gotCode = url.searchParams.get('code');
      if (gotCode === null) {
        ablehnen(new McpFehler('E_MCP_ANMELDUNG', '-', 'Redirect ohne Autorisierungscode.'));
        return;
      }
      erfuellen(gotCode);
    });

    server.on('error', (fehler) => {
      ablehnen(new McpFehler('E_MCP_ANMELDUNG', '-', `Lokaler Redirect-Server: ${(fehler as Error).name}.`));
    });

    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      optionen.melde?.('🌐  Browser oeffnet sich fuer die Anmeldung bei Scalable Capital …');
      // Ob der Browser wirklich aufging, sagt unter Windows kein Exit-Code (`browser.ts`) —
      // die Adresse muss sich deshalb immer von Hand oeffnen lassen.
      optionen.melde?.(`    Falls nicht, diese Adresse im Browser oeffnen:\n    ${authUrl.toString()}`);
      oeffneImBrowser(authUrl.toString(), optionen.melde);
    });

    setTimeout(() => {
      server.close();
      ablehnen(new McpFehler('E_MCP_ANMELDUNG', '-', 'Zeitlimit: kein Redirect innerhalb von 5 Minuten erhalten.'));
    }, AUTHORIZE_ZEITLIMIT_MS).unref();
  });

  const token = await codeGegenToken(client, code, verifier, k.mcpZeitlimitMs);
  tokenSchreiben(k, { ...token, geholtUm: Date.now() });
  // Eine Sitzung, die unter dem alten Token begonnen wurde, gehoert nicht zum neuen.
  mcpSitzungVergessen();
  optionen.melde?.('✅  Anmeldung erfolgreich, Token gespeichert.');
}

/**
 * Der Zugriffstoken fuer einen Ingest-Lauf: liest `token.json`, erneuert deren Dateirechte
 * vor jedem Lesen (die Datei koennte durch ein Backup-Werkzeug oder Ahnliches gelockert
 * worden sein), und tauscht still gegen den Refresh-Token, wenn der Zugriffstoken
 * abgelaufen ist. Oeffnet nie von selbst einen Browser — schlaegt der Tausch fehl, ist
 * `npm run mcp-login` der einzige Weg zurueck.
 */
export function zugriffstoken(k: Konfiguration): Promise<string> {
  // Parallele Aufrufe teilen sich einen Refresh: zwei gleichzeitige Tausche desselben
  // Refresh-Tokens entwerten bei rotierenden Tokens den einen durch den anderen.
  const datei = tokenDatei(k);
  const laufend = laufendeTokenabrufe.get(datei);
  if (laufend !== undefined) return laufend;
  const abruf = tokenAbrufen(k).finally(() => laufendeTokenabrufe.delete(datei));
  laufendeTokenabrufe.set(datei, abruf);
  return abruf;
}

const laufendeTokenabrufe = new Map<string, Promise<string>>();

async function tokenAbrufen(k: Konfiguration): Promise<string> {
  const datei = tokenDatei(k);
  const keinToken = (): McpFehler =>
    new McpFehler('E_MCP_ANMELDUNG', '-', 'Kein gespeicherter Token vorhanden — einmalig `npm run mcp-login` ausfuehren.');
  // Ausserhalb des try: eine fremde Datei ist E_DATEI_FREMD, nicht "neu anmelden".
  if (!eigeneDatei(datei)) throw keinToken();
  let gespeichert: GespeicherterToken;
  try {
    const roh: unknown = JSON.parse(readFileSync(datei, 'utf8'));
    // Die Datei koennte durch ein Backup-Werkzeug, ein manuelles Bearbeiten oder einen
    // frueheren Fehler beschaedigt sein — dann gilt sie wie eine fehlende: neu anmelden,
    // statt mit einem rohen Parse-/Schemafehler abzubrechen.
    const ergebnis = GespeicherterTokenSchema.safeParse(roh);
    if (!ergebnis.success) throw new Error('ungueltiges Tokenschema');
    gespeichert = ergebnis.data;
  } catch {
    throw keinToken();
  }

  const ablaufMs = gespeichert.geholtUm + (gespeichert.expires_in ?? 0) * 1000;
  if (gespeichert.expires_in === undefined || Date.now() < ablaufMs - ABLAUF_SICHERHEITSABSTAND_MS) {
    return gespeichert.access_token;
  }

  if (gespeichert.refresh_token === undefined) {
    throw new McpFehler('E_MCP_ANMELDUNG', '-', 'Zugriffstoken abgelaufen, kein Refresh-Token vorhanden — `npm run mcp-login` ausfuehren.');
  }

  // Ohne client.json still einen neuen Client zu registrieren hiesse, einen Refresh-Token
  // mit einer fremden client_id einzuloesen — das scheitert ohnehin, nur spaeter und unklarer.
  const client = gespeicherterClient(k);
  if (client === null) {
    throw new McpFehler('E_MCP_ANMELDUNG', '-', 'client.json fehlt oder ist ungueltig — `npm run mcp-login` ausfuehren.');
  }
  let antwort: GeleseneAntwort;
  try {
    antwort = await holeMitZeitlimit(
      TOKEN_URL,
      {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: gespeichert.refresh_token,
          client_id: client.client_id,
        }),
      },
      k.mcpZeitlimitMs,
      ANTWORT_GRENZE_BYTES,
    );
  } catch (fehler) {
    if (fehler instanceof NetzFehler) throw fehler;
    if ((fehler as Error).name === 'AbortError') {
      throw new McpFehler('E_MCP_ZEIT', '-', `Stiller Refresh: Zeitlimit von ${String(k.mcpZeitlimitMs)} ms ueberschritten.`);
    }
    throw new McpFehler('E_MCP_TRANSIENT', '-', 'Stiller Refresh fehlgeschlagen: Netzwerkfehler.');
  }

  if (antwort.status >= 300 && antwort.status < 400) {
    throw new McpFehler('E_MCP_ANMELDUNG', '-', `Stiller Refresh: unerwartete Umleitung (Status ${String(antwort.status)}).`);
  }
  // Ein 5xx sagt nichts ueber die Gueltigkeit des Refresh-Tokens — das ist ein Problem
  // der Gegenstelle in diesem Moment, kein Grund fuer eine neue interaktive Anmeldung.
  // Nur eine 4xx-Ablehnung (z. B. `invalid_grant`) ist definitiv: der Refresh-Token gilt
  // dann nicht mehr, und nur `npm run mcp-login` hilft.
  if (antwort.status >= 500) {
    throw new McpFehler(
      'E_MCP_TRANSIENT',
      '-',
      `Stiller Refresh voruebergehend fehlgeschlagen (Status ${String(antwort.status)}) — spaeter erneut versuchen.`,
    );
  }
  if (!antwort.ok) {
    throw new McpFehler('E_MCP_ANMELDUNG', '-', `Stiller Refresh abgelehnt (Status ${String(antwort.status)}) — \`npm run mcp-login\` ausfuehren.`);
  }

  const json = alsJson(antwort);
  const ergebnis = TokenAntwortSchema.safeParse(json);
  if (!ergebnis.success) {
    throw new McpFehler('E_MCP_ANMELDUNG', '-', 'Stiller Refresh: Antwort entspricht nicht dem erwarteten Schema.');
  }
  const neuerToken = ergebnis.data;

  const neu: GespeicherterToken = {
    ...neuerToken,
    // Ein Server, der beim Refresh keinen neuen refresh_token mitschickt, meint: der alte gilt weiter.
    refresh_token: neuerToken.refresh_token ?? gespeichert.refresh_token,
    geholtUm: Date.now(),
  };
  tokenSchreiben(k, neu);
  return neu.access_token;
}
