/**
 * JSON-RPC ueber HTTP gegen den Scalable-MCP: eine Sitzung je Prozess. [ADR-010]
 *
 * Kennt keine Allowlist und keine Seiten; das tut `mcp.ts`, das allein hierher ruft.
 * Fuer die Regeln (`redirect: 'manual'`, nichts protokollieren) siehe dort.
 */

import { z } from 'zod';
import { hinweis, type Hinweis } from '../shared/hinweise.ts';
import type { McpFehlerCode } from '../shared/laufFehler.ts';
import type { LesendesTool } from './mcp.ts';
import { lesenMitGrenze } from './netz.ts';
import { GRENZE } from './schema.ts';

export class McpFehler extends Error {
  readonly code: McpFehlerCode;
  readonly tool: string;
  /** Nur bei `E_MCP_DROSSEL`: was die Gegenstelle per `Retry-After` verlangt. */
  readonly wartenMs: number | undefined;
  constructor(code: McpFehlerCode, tool: string, meldung: string, wartenMs?: number) {
    super(meldung);
    this.name = 'McpFehler';
    this.code = code;
    this.tool = tool;
    this.wartenMs = wartenMs;
  }
}

const MCP_URL = 'https://mcp.scalable.capital/mcp';
const PROTOKOLLVERSION = '2025-06-18';
const CLIENT_INFO = { name: 'scapio', version: '1' };

let sitzungsId: string | undefined;
let initialisiert = false;
let laufendeInitialisierung: Promise<void> | null = null;
let jsonRpcId = 1;

/**
 * Sitzungszustand (Initialisierung, Mcp-Session-Id) zuruecksetzen — nach einer neuen
 * Anmeldung und nach `E_MCP_ANMELDUNG`, damit keine Sitzung des alten Tokens weiterlebt.
 */
export function mcpSitzungVergessen(): void {
  sitzungsId = undefined;
  initialisiert = false;
  laufendeInitialisierung = null;
  jsonRpcId = 1;
}

/** `Retry-After` als Sekunden oder HTTP-Datum; alles andere zaehlt als nicht angegeben. */
function retryAfterMs(kopf: string | null): number | undefined {
  if (kopf === null) return undefined;
  if (/^\d{1,6}$/.test(kopf.trim())) return Number(kopf.trim()) * 1000;
  const zeitpunkt = Date.parse(kopf);
  return Number.isNaN(zeitpunkt) ? undefined : Math.max(0, zeitpunkt - Date.now());
}

type JsonRpcErgebnis = { readonly ergebnis: unknown };

// Der Umschlag, nicht die Nutzlast: `result` prueft die jeweilige Quelle mit ihrem Schema.
// Nicht `.strict()`, weil eine Benachrichtigung im SSE-Strom `params` mitbringt und
// `error.data` frei ist; beides wird verworfen, nicht gelesen. [INV-12]
const JsonRpcNachricht = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.number().int(), z.string().max(64)]).nullable().optional(),
  method: z.string().max(200).optional(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number().int() }).optional(),
});
type JsonRpcNachricht = z.infer<typeof JsonRpcNachricht>;

/** Alle `data:`-Ereignisse eines SSE-Stroms; mehrzeilige Daten werden mit `\n` verbunden. */
function sseEreignisse(text: string): string[] {
  const ereignisse: string[] = [];
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n\n+/)) {
    const daten = block
      .split('\n')
      .filter((zeile) => zeile.startsWith('data:'))
      .map((zeile) => zeile.slice('data:'.length).replace(/^ /, ''));
    if (daten.length > 0) ereignisse.push(daten.join('\n'));
  }
  return ereignisse;
}

function alsNachricht(json: string, wo: string): JsonRpcNachricht {
  let roh: unknown;
  try {
    roh = JSON.parse(json);
  } catch {
    throw new Error(`MCP-Aufruf: ${wo} ist kein JSON.`);
  }
  const ergebnis = JsonRpcNachricht.safeParse(roh);
  if (!ergebnis.success) throw new Error(`MCP-Aufruf: ${wo} ist keine JSON-RPC-Nachricht.`);
  return ergebnis.data;
}

/**
 * Ein einzelner JSON-RPC-Aufruf mit Zeitlimit (`mcpZeitlimitMs`) und einer Sonderregel fuer
 * Status 404: der MCP-Server haelt Sitzungen nicht unbegrenzt vor, und ein 404 heisst hier
 * "Sitzung unbekannt", nicht "Adresse falsch". Statt sofort aufzugeben, wird die Sitzung
 * einmal neu aufgebaut und GENAU DIESER Aufruf einmal wiederholt (`erlaubtSitzungserneuerung`
 * verhindert eine zweite Runde, falls die Erneuerung selbst an einem 404 scheitert).
 */
async function jsonRpcAufruf(
  token: string,
  body: Record<string, unknown>,
  zeitlimitMs: number,
  melde?: (hinweis: Hinweis) => void,
  erlaubtSitzungserneuerung = true,
): Promise<JsonRpcErgebnis> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${token}`,
  };
  if (sitzungsId !== undefined) headers['mcp-session-id'] = sitzungsId;

  const abbruch = new AbortController();
  const wecker = setTimeout(() => abbruch.abort(), zeitlimitMs);

  try {
    let antwort: Response;
    try {
      antwort = await fetch(MCP_URL, {
        method: 'POST',
        redirect: 'manual',
        signal: abbruch.signal,
        headers,
        body: JSON.stringify(body),
      });
    } catch (fehler) {
      if ((fehler as Error).name === 'AbortError') {
        throw new McpFehler('E_MCP_ZEIT', '-', `MCP-Aufruf: Zeitlimit von ${String(zeitlimitMs)} ms ueberschritten.`);
      }
      throw new Error(`MCP-Aufruf fehlgeschlagen: ${(fehler as Error).name}.`);
    }

    const neueSitzung = antwort.headers.get('mcp-session-id');
    if (neueSitzung !== null) sitzungsId = neueSitzung;

    if (antwort.status === 404 && erlaubtSitzungserneuerung) {
      await antwort.body?.cancel();
      sitzungsId = undefined;
      initialisiert = false;
      melde?.(hinweis('mcpSitzungErneuert', {}));
      await sicherstellenInitialisiert(token, zeitlimitMs, melde);
      return await jsonRpcAufruf(token, body, zeitlimitMs, melde, false);
    }

    if (antwort.status >= 300 && antwort.status < 400) {
      await antwort.body?.cancel();
      throw new Error(`MCP-Aufruf: unerwartete Umleitung (Status ${String(antwort.status)}).`);
    }
    // 401/403 sind kein transienter Fehler. Entweder ist der Token abgelaufen oder
    // widerrufen, oder der MCP-Zugang im Scalable-Konto ist nicht freigeschaltet — beides
    // braucht eine neue Anmeldung, keine Wiederholung. Deshalb hier
    // ein eigener Code statt eines nackten `Error`, das in `lauf.ts` als `E_UNBEKANNT`
    // endete und im Runbook nicht auffindbar war. [ADR-012]
    if (antwort.status === 401 || antwort.status === 403) {
      await antwort.body?.cancel();
      throw new McpFehler(
        'E_MCP_ANMELDUNG',
        '-',
        `MCP verweigert den Zugriff (Status ${String(antwort.status)}).`,
      );
    }
    if (antwort.status === 404) {
      await antwort.body?.cancel();
      throw new Error('MCP-Aufruf: Sitzung auch nach Erneuerung abgelehnt (Status 404).');
    }
    if (antwort.status === 429 || antwort.status === 503) {
      await antwort.body?.cancel();
      throw new McpFehler(
        'E_MCP_DROSSEL',
        '-',
        `MCP drosselt (Status ${String(antwort.status)}).`,
        retryAfterMs(antwort.headers.get('retry-after')),
      );
    }
    if (!antwort.ok) {
      await antwort.body?.cancel();
      throw new Error(`MCP-Aufruf fehlgeschlagen (Status ${String(antwort.status)}).`);
    }

    let text: string;
    try {
      text = await lesenMitGrenze(antwort, GRENZE.nutzlastBytes);
    } catch (fehler) {
      if ((fehler as Error).name === 'AbortError') {
        throw new McpFehler('E_MCP_ZEIT', '-', `MCP-Aufruf: Zeitlimit von ${String(zeitlimitMs)} ms ueberschritten.`);
      }
      throw fehler;
    }
    if (text.trim().length === 0) return { ergebnis: null };

    const contentType = antwort.headers.get('content-type') ?? '';
    // Ein SSE-Strom kann vor der Antwort Benachrichtigungen tragen; die Antwort ist die
    // erste Nachricht ohne `method`.
    const nachrichten = contentType.includes('text/event-stream')
      ? sseEreignisse(text).map((e) => alsNachricht(e, 'SSE-Ereignis'))
      : [alsNachricht(text, 'Antwort')];
    const antwortNachricht = nachrichten.find((n) => n.method === undefined);
    if (antwortNachricht === undefined) return { ergebnis: null };

    if (antwortNachricht.error !== undefined) {
      // Nur der Code, nie `message`/`data`: beides kann Depotinhalt tragen (Regel 3 oben).
      throw new McpFehler('E_MCP_RPC', '-', `MCP lehnte den Aufruf ab (JSON-RPC-Code ${String(antwortNachricht.error.code)}).`);
    }
    return { ergebnis: antwortNachricht.result ?? null };
  } finally {
    clearTimeout(wecker);
  }
}

/** Parallele Aufrufe teilen sich eine Initialisierung, statt je eine eigene Sitzung zu oeffnen. */
export function sicherstellenInitialisiert(token: string, zeitlimitMs: number, melde?: (hinweis: Hinweis) => void): Promise<void> {
  if (initialisiert) return Promise.resolve();
  if (laufendeInitialisierung !== null) return laufendeInitialisierung;
  const lauf = initialisieren(token, zeitlimitMs, melde).finally(() => {
    if (laufendeInitialisierung === lauf) laufendeInitialisierung = null;
  });
  laufendeInitialisierung = lauf;
  return lauf;
}

async function initialisieren(token: string, zeitlimitMs: number, melde?: (hinweis: Hinweis) => void): Promise<void> {
  await jsonRpcAufruf(
    token,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: PROTOKOLLVERSION, capabilities: {}, clientInfo: CLIENT_INFO },
    },
    zeitlimitMs,
    melde,
  );
  // Eine Benachrichtigung erwartet keine sinnvolle Antwort — ein Fehler hier ist kein Grund abzubrechen.
  await jsonRpcAufruf(token, { jsonrpc: '2.0', method: 'notifications/initialized' }, zeitlimitMs, melde).catch(
    () => undefined,
  );
  initialisiert = true;
}

function extrahiereInhalt(ergebnis: unknown): unknown {
  if (ergebnis === null || typeof ergebnis !== 'object') return null;
  if ((ergebnis as { isError?: unknown }).isError === true) return null;

  const inhalt = (ergebnis as { content?: unknown }).content;
  if (!Array.isArray(inhalt)) return null;

  for (const block of inhalt) {
    if (block === null || typeof block !== 'object') continue;
    if ((block as { type?: unknown }).type !== 'text') continue;
    const text = (block as { text?: unknown }).text;
    if (typeof text !== 'string') continue;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return null;
}

export async function werkzeugAufruf(
  token: string,
  tool: LesendesTool,
  argumente: Record<string, unknown>,
  zeitlimitMs: number,
  melde?: (hinweis: Hinweis) => void,
): Promise<unknown> {
  jsonRpcId += 1;
  const { ergebnis } = await jsonRpcAufruf(
    token,
    {
      jsonrpc: '2.0',
      id: jsonRpcId,
      method: 'tools/call',
      params: { name: tool, arguments: argumente },
    },
    zeitlimitMs,
    melde,
  );
  const inhalt = extrahiereInhalt(ergebnis);
  if (inhalt === null) throw new Error('Werkzeugantwort ohne verwertbaren Inhalt.');
  return inhalt;
}
