/**
 * Die ZWEITE und letzte mutierende Route: `POST /api/mcp-anmeldung`. [INV-08, ADR-012]
 *
 * Sie stoesst denselben PKCE-Ablauf an wie `npm run mcp-login` — Browser oeffnen, auf den
 * Redirect nach `127.0.0.1:8732` warten, Code gegen Tokens tauschen. Ohne sie fuehrte der
 * einzige Weg aus einer abgelaufenen oder nicht freigeschalteten Anmeldung durch das
 * Terminal, waehrend die Oberflaeche nur "gescheitert" anzeigen konnte.
 *
 * Warum das INV-08 nicht aufweicht: die Route nimmt — wie `/api/refresh` — KEINERLEI
 * Eingabe entgegen (`sicherheit.ts` weist Rumpf und Query bereits mit 400 ab), und sie
 * schreibt nichts in die Datenbank. Sie beruehrt genau eine Datei ausserhalb davon:
 * `<datenpfad>/mcp/token.json`. Der Grund der Invariante — keine Eingabe, die einen Lauf
 * steuert, und keine schreibende Depot-API — bleibt damit unberuehrt. Die Begruendung
 * steht ausfuehrlich in ADR-012.
 *
 * `GET /api/mcp-anmeldung` daneben ist rein lesend und sagt nur, OB eine Anmeldung
 * existiert und ob gerade eine laeuft. Die Pruefung ist ein `existsSync` auf die
 * Tokendatei — kein Netzwerkzugriff, kein Lesen des Tokens. Der Tokenwert selbst
 * verlaesst diesen Prozess nie.
 */

import { existsSync } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Konfiguration } from '../../shared/konfiguration.ts';
import { mcpTokenPfad } from '../../shared/konfiguration.ts';
import { ApiFehler } from '../fehler.ts';
import { objektSchema, oderNull, umschlagAus, umschlagSchemaEigenschaften } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import type { Kontext } from '../server.ts';
import type { McpAnmeldung } from '../vertrag.ts';

const ANTWORT_SCHEMA = objektSchema<McpAnmeldung>({
  angemeldet: { type: 'boolean' },
  laeuft: { type: 'boolean' },
  fehler: oderNull(
    objektSchema<NonNullable<McpAnmeldung['fehler']>>({
      code: { type: 'string' },
      text: { type: 'string' },
    }),
  ),
  ...umschlagSchemaEigenschaften,
});

/**
 * Was der Server von `ingest/mcpAnmeldung.ts` braucht — nicht mehr. Wie beim Refresh
 * gehoert der Ingest einem anderen Ordner; hier steht nur die Aufrufform, damit der
 * spaetere `await import` typisiert bleibt.
 */
type Anmeldemodul = {
  readonly anmelden: (k: Konfiguration, optionen: { readonly melde: (text: string) => void }) => Promise<void>;
};

let geladen: Anmeldemodul | null = null;

async function ladeAnmeldung(): Promise<Anmeldemodul> {
  if (geladen !== null) return geladen;
  try {
    geladen = (await import('../../ingest/mcpAnmeldung.ts')) as unknown as Anmeldemodul;
  } catch {
    throw new ApiFehler(
      'E_INTERN',
      500,
      'Die MCP-Anmeldung steht auf diesem Rechner nicht bereit.',
      'Starte Scapio neu (Start.command bzw. .bat). Bleibt die Meldung, hilft docs/RUNBOOK.md weiter (Entwickler: npm run mcp-login).',
    );
  }
  return geladen;
}

/** Reine Dateipruefung, kein Netz und kein Lesen des Tokens. */
function angemeldet(k: Konfiguration): boolean {
  return existsSync(mcpTokenPfad(k));
}

type Anmeldefehler = { readonly code: string; readonly text: string };

/**
 * Nie die Meldung aus dem Anmeldeablauf — sie kann eine Antwort der Gegenstelle
 * enthalten. Nur der eigene Code und ein eigener Satz, wie bei `lauf.fehlerText`.
 */
function fehlerAus(fehler: unknown): Anmeldefehler {
  const code = (fehler as { code?: unknown }).code;
  return {
    code: typeof code === 'string' && code.length > 0 ? code : 'E_UNBEKANNT',
    text: 'Die Anmeldung wurde nicht abgeschlossen. Siehe docs/RUNBOOK.md zum Code.',
  };
}

export function registriereMcpAnmeldung(app: FastifyInstance, ctx: Kontext): void {
  // Zustand des laufenden Anmeldeversuchs. Er lebt an der Serverinstanz, nicht im Modul:
  // ein Test, der zwei Server baut, soll nicht den Zustand des anderen sehen.
  let laeuft = false;
  let letzterFehler: Anmeldefehler | null = null;

  app.get('/api/mcp-anmeldung', { schema: { response: { 200: ANTWORT_SCHEMA } } }, (): McpAnmeldung => {
    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    return {
      angemeldet: angemeldet(ctx.konfiguration),
      laeuft,
      fehler: letzterFehler,
      ...umschlagAus(lm.stand(), lm.drift()),
    };
  });

  app.post('/api/mcp-anmeldung', { schema: { response: { 202: ANTWORT_SCHEMA } } }, async (
    anfrage: FastifyRequest,
    antwort: FastifyReply,
  ) => {
    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);

    // Zwei offene Anmeldungen hiessen zwei Browserfenster und zwei Listener auf
    // demselben Port 8732 — der zweite scheiterte ohnehin. Also 409, wie beim Lauf.
    if (laeuft) {
      throw new ApiFehler(
        'E_SPERRE',
        409,
        'Es laeuft bereits eine Anmeldung.',
        'Schliesse sie im Browserfenster ab oder warte, bis sie nach fuenf Minuten abbricht.',
      );
    }

    // Die Anmeldung ersetzt token.json, die der laufende Ingest gerade liest und still
    // erneuert — der Lauf gewaenne oder verloere den Token je nach Reihenfolge.
    ctx.sperre.pruefeFrei();

    const modul = await ladeAnmeldung();
    laeuft = true;
    letzterFehler = null;

    // Der Ablauf wartet auf einen Menschen im Browser und darf deshalb nicht an dieser
    // Antwort haengen: 202 geht sofort hinaus, den Ausgang holt sich die Oberflaeche
    // per GET auf dieselbe Adresse — genau wie beim Lauf ueber `/api/lauf`.
    void modul
      // Klartext statt Log-Zeile: die Adresse muss sich aus dem Konsolenfenster kopieren
      // lassen, falls der Browser nicht aufgeht.
      .anmelden(ctx.konfiguration, { melde: (text) => process.stdout.write(`${text}\n`) })
      .catch((fehler: unknown) => {
        letzterFehler = fehlerAus(fehler);
        app.log.error({ stelle: 'mcp-anmeldung' }, letzterFehler.code);
      })
      .finally(() => {
        laeuft = false;
      });

    const antwortKoerper: McpAnmeldung = {
      angemeldet: angemeldet(ctx.konfiguration),
      laeuft: true,
      fehler: null,
      ...umschlagAus(lm.stand(), lm.drift()),
    };
    return antwort.code(202).send(antwortKoerper);
  });
}
