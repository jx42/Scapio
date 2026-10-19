/**
 * Der direkte JSON-RPC-Aufruf gegen den Scalable-MCP — ohne Claude-Code-Kindprozess. [ADR-010]
 *
 * Ersetzt `ingest/claude.ts`. Die Schnittstelle fuer die Quellen ist `mcpAufrufRoh`
 * (dazu `LESENDE_TOOLS`, `LesendesTool`, `McpFehler`); der Transport ist ein `fetch`
 * gegen `/mcp` mit einem selbst verwalteten `access_token` (siehe `mcpAnmeldung.ts`)
 * statt eines `claude`-Kindprozesses.
 *
 * Die drei Regeln, an denen hier nicht gedreht wird:
 *
 *   1. `LesendesTool` ist eine geschlossene Union LESENDER Toolnamen — zusaetzlich zur
 *      Typebene noch einmal zur Laufzeit erzwungen (`LESENDE_TOOLS.includes(tool)`, vor
 *      jedem Netzwerkzugriff). Das ist die zweite, unabhaengige Sperre, die frueher
 *      `--allowedTools` auf Prozessebene durchsetzte und mit dem Kindprozess wegfaellt. [INV-01]
 *   2. `redirect: 'manual'` bei jedem `fetch`: eine Umleitung koennte den
 *      `Authorization`-Kopf an eine unbeabsichtigte Gegenstelle schicken.
 *   3. Die MCP-Ausgabe wird nie protokolliert, weder bei Erfolg noch im Fehlerfall.
 *      Fehlermeldungen duerfen Laenge und Typ nennen, nie Inhalt — eine MCP-Fehlerantwort
 *      kann ebenso Depotdaten enthalten wie frueher `stdout`.
 */

import type { Konfiguration } from '../shared/konfiguration.ts';
import { ladeKonfiguration } from '../shared/konfiguration.ts';
import { zugriffstoken } from './mcpAnmeldung.ts';
import { lesenMitGrenze } from './netz.ts';
import { z } from 'zod';
import { GRENZE, ISIN_MUSTER } from './schema.ts';
import type { Zeitfenster } from './schema.ts';
import { hinweis, type Hinweis } from '../shared/hinweise.ts';
import type { McpFehlerCode } from '../shared/laufFehler.ts';

/**
 * Die Allowlist. Ausschliesslich lesende Tools, mit dem Namen, den die Gegenstelle kennt —
 * ohne das Praefix, unter dem Claude Code dieselben Tools fuehrt; das bleibt Agenten
 * gesperrt [ADR-054]. [INV-01]
 * Diese Liste waechst nicht um ein Tool, das Auftraege erteilt, Sparplaene aendert oder
 * irgendetwas beim Broker anlegt oder entfernt — die Anwendung ist ein Beobachter.
 */
export const LESENDE_TOOLS = [
  'get_portfolio_holdings',
  'list_portfolio_transactions',
  'get_security_chart',
  'list_savings_plans',
  'get_portfolio_cash_breakdown',
  'get_portfolio_overview',
  'get_security_quote',
] as const;

export type LesendesTool = (typeof LESENDE_TOOLS)[number];

const TRANSAKTIONEN_TOOL: LesendesTool = 'list_portfolio_transactions';
const CHART_TOOL: LesendesTool = 'get_security_chart';
const QUOTE_TOOL: LesendesTool = 'get_security_quote';

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

/** So viele Zeitueberschreitungen in Folge, dann erreicht kein Aufruf dieses Laufs mehr den MCP. */
export const ZEITFEHLER_BIS_ABBRUCH = 2;
/**
 * So viele im ganzen Lauf, gleich ob in Folge: bei vier parallelen Kursabrufen setzt ein
 * Erfolg dazwischen die Folge zurueck, und ein halb haengender MCP kaeme nie an die Grenze
 * oben [ADR-031, Nachtrag].
 */
export const ZEITFEHLER_IM_LAUF_BIS_ABBRUCH = 5;

/**
 * Laufweiter Kurzschluss [ADR-031]. Ohne ihn ruft ein Lauf nach einer abgelehnten Anmeldung
 * oder bei haengender Gegenstelle fuer jede ISIN und jedes Kursfenster weiter an — bei
 * `mcpZeitlimitMs` je Aufruf haelt das die Sperre stundenlang. Ein Objekt je Lauf, nicht
 * Modulzustand: der naechste Lauf faengt frisch an.
 */
export class McpSicherung {
  #grund: McpFehler | null = null;
  #zeitfehlerInFolge = 0;
  #zeitfehlerImLauf = 0;

  get ausgeloest(): boolean {
    return this.#grund !== null;
  }

  /** Wirft, wenn der Kurzschluss ausgeloest ist — vor Konfiguration, Token und Netz. */
  pruefe(tool: string): void {
    if (this.#grund !== null) {
      throw new McpFehler(this.#grund.code, tool, `Uebersprungen, weil der MCP in diesem Lauf schon scheiterte: ${this.#grund.message}`);
    }
  }

  erfolg(): void {
    this.#zeitfehlerInFolge = 0;
  }

  fehler(fehler: unknown): void {
    if (!(fehler instanceof McpFehler)) return;
    if (fehler.code === 'E_MCP_ANMELDUNG' || fehler.code === 'E_MCP_DROSSEL') {
      this.#grund = fehler;
    } else if (fehler.code === 'E_MCP_ZEIT') {
      this.#zeitfehlerInFolge += 1;
      this.#zeitfehlerImLauf += 1;
      if (this.#zeitfehlerInFolge >= ZEITFEHLER_BIS_ABBRUCH || this.#zeitfehlerImLauf >= ZEITFEHLER_IM_LAUF_BIS_ABBRUCH) {
        this.#grund = fehler;
      }
    }
  }
}

/** `fenster` braucht nur `get_security_chart`. */
export type Ergaenzung = { readonly isin: string; readonly fenster?: Zeitfenster };

export type McpOptionen = {
  readonly konfiguration?: Konfiguration;
  readonly ergaenzung?: Ergaenzung;
  /** Wird bei einem Vorfall gerufen — etwa einer erzwungenen Sitzungserneuerung nach Status 404. */
  readonly melde?: (hinweis: Hinweis) => void;
  /** Laufweiter Kurzschluss; ohne ihn steht jeder Aufruf fuer sich. */
  readonly sicherung?: McpSicherung;
  /** Pause vor der Wiederholung. Tests ersetzen sie, damit sie nicht wirklich warten. */
  readonly warte?: (ms: number) => Promise<void>;
};

export type McpAntwort = {
  /** Ein Eintrag je Werkzeugantwort, in der Reihenfolge des Aufrufs. */
  readonly bloecke: readonly unknown[];
  /** Die Rohnutzlast fuer `raw_snapshot`, kanonisch als JSON-Array. */
  readonly rohJson: string;
};

// ---------------------------------------------------------------------------
// JSON-RPC-Transport: eine Sitzung je Prozess.
// ---------------------------------------------------------------------------

const MCP_URL = 'https://mcp.scalable.capital/mcp';
const PROTOKOLLVERSION = '2025-06-18';
const CLIENT_INFO = { name: 'scapio', version: '1' };
const HOECHSTENS_SEITEN = 50;
/** Ab hier warnt ein Hinweis, bevor die Decke den Abruf der Transaktionen hart abbricht. */
const SEITEN_VORWARNUNG = Math.ceil(HOECHSTENS_SEITEN * 0.8);
/** Pause vor der einen Wiederholung; ein sofortiger zweiter Versuch trifft dieselbe Stoerung. */
const WIEDERHOLUNG_NACH_MS = 1_000;
/** Laenger verlangt `Retry-After` nicht, sonst wird nicht gewartet, sondern abgebrochen. */
const HOECHSTENS_WARTEN_MS = 30_000;

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

const warteEcht = (ms: number): Promise<void> => new Promise((fertig) => setTimeout(fertig, ms));

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
function sicherstellenInitialisiert(token: string, zeitlimitMs: number, melde?: (hinweis: Hinweis) => void): Promise<void> {
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

async function werkzeugAufruf(
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

function naechsterCursor(block: unknown): string | null {
  if (block === null || typeof block !== 'object') return null;
  const seite = (block as { page?: unknown }).page;
  if (seite === null || typeof seite !== 'object') return null;
  const cursor = (seite as { nextCursor?: unknown }).nextCursor;
  return typeof cursor === 'string' ? cursor : null;
}

async function seitenAbrufen(
  token: string,
  tool: LesendesTool,
  basisArgumente: Record<string, unknown>,
  zeitlimitMs: number,
  melde?: (hinweis: Hinweis) => void,
): Promise<unknown[]> {
  const seiten: unknown[] = [];
  let cursor: string | undefined;
  for (let seite = 0; seite < HOECHSTENS_SEITEN; seite += 1) {
    const argumente = cursor === undefined ? basisArgumente : { ...basisArgumente, cursor };
    const inhalt = await werkzeugAufruf(token, tool, argumente, zeitlimitMs, melde);
    seiten.push(inhalt);
    const weiter = naechsterCursor(inhalt);
    if (weiter === null) {
      if (seiten.length >= SEITEN_VORWARNUNG) {
        melde?.(hinweis('transaktionenSeitenGrenze', { seiten: seiten.length, hoechstens: HOECHSTENS_SEITEN }));
      }
      return seiten;
    }
    cursor = weiter;
  }
  // HOECHSTENS_SEITEN erschoepft und noch ein Cursor offen: ein stiller Abbruch haette hier
  // eine unvollstaendige Transaktionsliste als vollstaendige ausgegeben (Vorfall: Seiten-
  // deckel griff, `holeTransaktionen` sah nur die letzte Seite und stornierte die fehlenden
  // Transaktionen als "verschwunden"). Lieber werfen als eine Luecke stillschweigend importieren.
  throw new McpFehler(
    'E_MCP_SEITEN',
    tool,
    `Mehr als ${String(HOECHSTENS_SEITEN)} Seiten noetig, aber noch nicht alle abgerufen.`,
  );
}

function argumenteFuer(tool: LesendesTool, ergaenzung: Ergaenzung | undefined): Record<string, unknown> {
  if (tool === CHART_TOOL) {
    if (ergaenzung?.fenster === undefined) {
      throw new McpFehler('E_MCP_ARGUMENT', tool, 'get_security_chart braucht isin und fenster.');
    }
    if (!ISIN_MUSTER.test(ergaenzung.isin)) {
      throw new McpFehler('E_MCP_ARGUMENT', tool, 'ISIN passt nicht zum Muster.');
    }
    return { isin: ergaenzung.isin, timeframe: ergaenzung.fenster };
  }
  if (tool === QUOTE_TOOL) {
    if (ergaenzung === undefined) {
      throw new McpFehler('E_MCP_ARGUMENT', tool, 'get_security_quote braucht isin.');
    }
    if (!ISIN_MUSTER.test(ergaenzung.isin)) {
      throw new McpFehler('E_MCP_ARGUMENT', tool, 'ISIN passt nicht zum Muster.');
    }
    return { isin: ergaenzung.isin };
  }
  if (tool === TRANSAKTIONEN_TOOL) {
    return { pageSize: 100 };
  }
  return {};
}

/**
 * Ruft ein lesendes Tool auf und gibt ALLE Werkzeugantworten zurueck.
 * `list_portfolio_transactions` blaettert und liefert deshalb mehrere.
 *
 * Ablauf bei Misserfolg: ein Versuch, nach einer Pause EINE Wiederholung, dann Abbruch
 * [ADR-031]. Bei Drosselung (429/503) gilt `Retry-After`, solange es unter
 * `HOECHSTENS_WARTEN_MS` bleibt; laenger wird nicht gewartet. Einen Notbehelf aus einer
 * Cache-Datei gibt es nicht — er konnte einen echten Ausfall stillschweigend durch veraltete
 * Daten ersetzen.
 *
 * Ein Anmeldeproblem und eine unvollstaendige Blaetterung sind kein transienter Fehler, der
 * eine Wiederholung verdient — beide brauchen ein Eingreifen (neue Anmeldung bzw. Pruefung
 * der Seitenzahl), nicht einen zweiten stillen Versuch. Ein Anmeldeproblem tritt in zwei
 * Formen auf: `zugriffstoken` schlaegt fehl (kein Token, Refresh abgelehnt), oder der MCP
 * antwortet mit 401/403 (Zugang im Konto nicht freigeschaltet). Beide tragen den Code
 * `E_MCP_ANMELDUNG`, den die Oberflaeche in einen Anmeldeknopf uebersetzt. [ADR-012]
 */
export async function mcpAufrufRoh(tool: LesendesTool, optionen: McpOptionen = {}): Promise<McpAntwort> {
  if (!LESENDE_TOOLS.includes(tool)) {
    throw new McpFehler('E_MCP_ARGUMENT', String(tool), 'Tool steht nicht in der Allowlist lesender Werkzeuge.');
  }
  optionen.sicherung?.pruefe(tool);

  try {
    const antwort = await mitWiederholung(tool, optionen);
    optionen.sicherung?.erfolg();
    return antwort;
  } catch (fehler) {
    optionen.sicherung?.fehler(fehler);
    if (fehler instanceof McpFehler && fehler.code === 'E_MCP_ANMELDUNG') mcpSitzungVergessen();
    throw fehler;
  }
}

/** Fehler, die eine Wiederholung nicht aendert — sie gehen sofort durch. [ADR-012] */
const OHNE_WIEDERHOLUNG = new Set(['E_MCP_ANMELDUNG', 'E_MCP_SEITEN', 'E_MCP_RPC']);

async function mitWiederholung(tool: LesendesTool, optionen: McpOptionen): Promise<McpAntwort> {
  const k = optionen.konfiguration ?? ladeKonfiguration();
  const argumente = argumenteFuer(tool, optionen.ergaenzung);
  const token = await zugriffstoken(k);
  const zeitlimitMs = k.mcpZeitlimitMs;
  const warte = optionen.warte ?? warteEcht;
  await sicherstellenInitialisiert(token, zeitlimitMs, optionen.melde);

  let letzter: unknown;
  for (let versuch = 1; versuch <= 2; versuch += 1) {
    try {
      if (tool === TRANSAKTIONEN_TOOL) {
        const bloecke = await seitenAbrufen(token, tool, argumente, zeitlimitMs, optionen.melde);
        return { bloecke, rohJson: JSON.stringify(bloecke) };
      }
      const ergebnis = await werkzeugAufruf(token, tool, argumente, zeitlimitMs, optionen.melde);
      return { bloecke: [ergebnis], rohJson: JSON.stringify([ergebnis]) };
    } catch (fehler) {
      letzter = fehler;
      if (!(fehler instanceof McpFehler)) {
        if (versuch === 1) await warte(WIEDERHOLUNG_NACH_MS);
        continue;
      }
      if (OHNE_WIEDERHOLUNG.has(fehler.code)) throw new McpFehler(fehler.code, tool, fehler.message);
      const pause = fehler.code === 'E_MCP_DROSSEL' ? (fehler.wartenMs ?? WIEDERHOLUNG_NACH_MS) : WIEDERHOLUNG_NACH_MS;
      if (pause > HOECHSTENS_WARTEN_MS) throw new McpFehler(fehler.code, tool, fehler.message);
      if (versuch === 1) await warte(Math.max(pause, WIEDERHOLUNG_NACH_MS));
    }
  }

  // Zeitlimit und Drosselung behalten ihren Code: der Kurzschluss zaehlt sie.
  if (letzter instanceof McpFehler && (letzter.code === 'E_MCP_ZEIT' || letzter.code === 'E_MCP_DROSSEL')) {
    throw new McpFehler(letzter.code, tool, `${tool}: ${letzter.message}`);
  }
  throw new McpFehler('E_MCP_ABGELEHNT', tool, `${tool}: ${(letzter as Error).message}.`);
}
