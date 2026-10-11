/**
 * Eine einzige Fehlerform fuer die gesamte API.
 *
 * Der Browser bekommt einen Code, einen Satz und einen Hinweis, was zu tun ist —
 * nie einen Stacktrace, nie eine SQL-Zeichenkette, nie einen Dateipfad. Ein
 * Dateipfad verraet den Benutzernamen; eine SQL-Zeichenkette verraet das Schema.
 * Beides gehoert ins Terminal des Betreibers, nicht in die Antwort. [server/CLAUDE.md]
 *
 * Weil alle Routen `ApiFehler` werfen und ein einziger `setErrorHandler` sie
 * uebersetzt, kann keine Route ihre eigene Fehlerform erfinden.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export type FehlerCode =
  | 'E_HOST'
  | 'E_HERKUNFT'
  | 'E_TOKEN'
  | 'E_PARAMETER'
  | 'E_RUMPF'
  | 'E_METHODE'
  | 'E_NICHT_GEFUNDEN'
  | 'E_SPERRE'
  | 'E_INTERN';

export type Fehlerkoerper = {
  readonly fehler: {
    readonly code: FehlerCode;
    readonly text: string;
    readonly hinweis: string;
  };
};

/** Zusatzfelder neben `fehler` — nur `409` nutzt das, fuer den laufenden Lauf. */
export type Beiwerk = Readonly<Record<string, unknown>>;

export class ApiFehler extends Error {
  readonly code: FehlerCode;
  readonly status: number;
  readonly hinweis: string;
  readonly beiwerk: Beiwerk;

  constructor(code: FehlerCode, status: number, text: string, hinweis: string, beiwerk: Beiwerk = {}) {
    super(text);
    this.name = 'ApiFehler';
    this.code = code;
    this.status = status;
    this.hinweis = hinweis;
    this.beiwerk = beiwerk;
  }

  koerper(): Fehlerkoerper & Beiwerk {
    return { ...this.beiwerk, fehler: { code: this.code, text: this.message, hinweis: this.hinweis } };
  }
}

export const hostAbgelehnt = (): ApiFehler =>
  new ApiFehler(
    'E_HOST',
    403,
    'Diese Adresse bedient der Server nicht.',
    'Das Dashboard läuft nur unter 127.0.0.1. Öffne die Adresse, die beim Start genannt wurde.',
  );

export const herkunftAbgelehnt = (): ApiFehler =>
  new ApiFehler(
    'E_HERKUNFT',
    403,
    'Die Anfrage kommt nicht von der Oberfläche dieses Servers.',
    'Lade die Seite neu und rufe die API aus dem Dashboard heraus auf.',
  );

export const tokenFehlt = (): ApiFehler =>
  new ApiFehler(
    'E_TOKEN',
    403,
    'Der Sitzungsschlüssel fehlt oder passt nicht.',
    'Lade die Seite neu — der Schlüssel wird bei jedem Serverstart neu vergeben.',
  );

export const parameterAbgelehnt = (was: string): ApiFehler =>
  new ApiFehler('E_PARAMETER', 400, `Der Parameter ${was} ist unbekannt oder ungültig.`, 'Prüfe die Adresse.');

/**
 * Unbekannter Parameter. Der Name wird ABSICHTLICH nicht zurueckgegeben — er stammt aus
 * der Adresszeile und ist damit Fremdtext, der nichts in einer Antwort zu suchen hat.
 */
export const unbekannterParameter = (): ApiFehler =>
  new ApiFehler(
    'E_PARAMETER',
    400,
    'Die Adresse enthält einen Parameter, den diese Route nicht kennt.',
    'Rufe die Route ohne zusätzliche Parameter auf.',
  );

/** Wirft, sobald die Adresse etwas anderes als die erlaubten Parameter traegt. */
export function nurDieseParameter(query: unknown, erlaubt: readonly string[]): Record<string, unknown> {
  const q = (query ?? {}) as Record<string, unknown>;
  for (const schluessel of Object.keys(q)) {
    if (!erlaubt.includes(schluessel)) throw unbekannterParameter();
  }
  return q;
}

export const rumpfAbgelehnt = (): ApiFehler =>
  new ApiFehler(
    'E_RUMPF',
    400,
    'Diese Route nimmt weder Rumpf noch Parameter entgegen.',
    'Sende POST /api/refresh ohne Inhalt.',
  );

export const nichtGefunden = (): ApiFehler =>
  new ApiFehler('E_NICHT_GEFUNDEN', 404, 'Diese Route gibt es nicht.', 'Prüfe die Adresse.');

/**
 * Der einzige Uebersetzer von Ausnahme zu Antwort. Alles, was keine `ApiFehler` ist,
 * wird zu `E_INTERN` mit einem festen Satz — die echte Ursache steht im Terminal.
 */
export function registriereFehlerbehandlung(app: FastifyInstance): void {
  app.setNotFoundHandler((_anfrage: FastifyRequest, antwort: FastifyReply) => {
    const f = nichtGefunden();
    return antwort.code(f.status).send(f.koerper());
  });

  app.setErrorHandler((fehler: unknown, anfrage: FastifyRequest, antwort: FastifyReply) => {
    if (fehler instanceof ApiFehler) {
      return antwort.code(fehler.status).send(fehler.koerper());
    }

    // @fastify/static weist einen nicht kanonischen Pfad (`//`, `..%5c`) mit 403 ab. Fuer
    // den Aufrufer ist das dasselbe wie eine fehlende Datei, und ins Protokoll gehoert er nicht.
    const status = (fehler as { statusCode?: unknown } | null)?.statusCode;
    if (status === 403 || status === 404) {
      const f = nichtGefunden();
      return antwort.code(f.status).send(f.koerper());
    }

    // Nur hier, nur lokal, nie in der Antwort.
    anfrage.log.error({ pfad: anfrage.url }, (fehler as Error)?.message ?? 'unbekannter Fehler');

    const f = new ApiFehler(
      'E_INTERN',
      500,
      'Der Server konnte die Anfrage nicht beantworten.',
      'Starte Scapio neu (Start.command bzw. .bat). Bleibt die Meldung, steht der Grund im Fenster, in dem Scapio läuft; weiter hilft docs/RUNBOOK.md.',
    );
    return antwort.code(f.status).send(f.koerper());
  });
}
