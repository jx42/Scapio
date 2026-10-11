/**
 * Die EINZIGE mutierende Route der gesamten Anwendung. [INV-08]
 *
 * Kein Rumpf, kein Parameter, keine Variante: `POST /api/refresh` heisst "hol alles neu"
 * und sonst nichts. Waere hier ein Parameter, muesste er validiert werden, und die naechste
 * Frage waere, welche Quelle man einzeln anstossen darf — das ist der Weg zu einer
 * schreibenden API. Rumpf und Parameter weist bereits `sicherheit.ts` mit 400 ab, der
 * Sitzungsschluessel wird dort geprueft.
 *
 * Die Antwort ist 202: der Lauf beginnt, die Antwort wartet nicht auf ihn. Fortschritt
 * gibt es unter `/api/lauf`. Laeuft schon einer, kommt 409 mit `laufId`, `quelle`, `seit`.
 *
 * Der Ingest selbst wird ERST HIER geladen (`await import`). So startet der Server auch
 * dann, wenn die Ingest-Kette nicht bereitsteht — die Anzeige gespeicherter Daten haengt
 * nicht an der Beschaffung neuer.
 */

import { setTimeout as warte } from 'node:timers/promises';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Tag } from '../../core/kalender.ts';
import type { Konfiguration } from '../../shared/konfiguration.ts';
import * as repository from '../../db/repository/index.ts';
import { ApiFehler } from '../fehler.ts';
import { objektSchema, umschlagAus, umschlagSchemaEigenschaften } from '../json.ts';
import { baueLesemodell } from '../lesemodell.ts';
import type { Kontext } from '../server.ts';
import type { RefreshAntwort } from '../vertrag.ts';

const ANTWORT_SCHEMA = objektSchema<RefreshAntwort>({
  laufId: { type: ['integer', 'null'] },
  ...umschlagSchemaEigenschaften,
});

/**
 * Was der Server von `ingest/lauf.ts` braucht — nicht mehr. Der Ingest gehoert einem
 * anderen Ordner; hier steht nur seine Aufrufform, damit ein spaeterer `await import`
 * typisiert bleibt.
 *
 * `heute` ist ein Parameter, keine Uhr im Ingest: derselbe Kalendertag, den auch das
 * Lesemodell dieser Anfrage benutzt. [INV-03]
 *
 * Die Lauf-Nummer erfaehrt der Server nicht ueber den Rueckgabewert — den gaebe es erst
 * am ENDE des Laufs —, sondern aus der `lauf`-Tabelle, in die sich der Lauf beim Start
 * selbst eintraegt (§6.1, Schritt 2).
 *
 * Die Sperre nimmt bewusst DIESE Route, nicht `fuehreLaufAus`: der Ingest laesst sich
 * auch von Hand starten, und nur der Server kennt den laufenden Prozess.
 */
type Ingestmodul = {
  readonly fuehreLaufAus: (optionen: {
    readonly db: DatabaseSync;
    readonly konfiguration: Konfiguration;
    readonly heute: Tag;
  }) => Promise<unknown>;
};

let geladen: Ingestmodul | null = null;

async function ladeIngest(): Promise<Ingestmodul> {
  if (geladen !== null) return geladen;
  try {
    geladen = (await import('../../ingest/lauf.ts')) as unknown as Ingestmodul;
  } catch {
    throw new ApiFehler(
      'E_INTERN',
      500,
      'Der Ingest steht auf diesem Rechner nicht bereit.',
      'Starte Scapio neu (Start.command bzw. .bat). Bleibt die Meldung, hilft docs/RUNBOOK.md weiter.',
    );
  }
  return geladen;
}

/** Wie lange auf die Lauf-Nummer gewartet wird, bevor die 202 ohne sie hinausgeht. */
const WARTE_MS = 2000;
const TAKT_MS = 25;

/**
 * Der Lauf traegt sich selbst in die Tabelle ein. Statt eine Rueckgabe zu erzwingen —
 * die es erst am ENDE des Laufs gaebe — wird kurz auf die neue Zeile gewartet.
 * Kommt sie nicht, geht die 202 mit `laufId: null` hinaus; die Oberflaeche fragt dann
 * ohnehin `/api/lauf` ab.
 */
async function warteAufLaufId(db: DatabaseSync, vorher: number | null): Promise<number | null> {
  const grenze = Date.now() + WARTE_MS;
  while (Date.now() < grenze) {
    const jetzt = repository.lauf.letzter(db);
    if (jetzt !== null && (vorher === null || jetzt.id > vorher)) return jetzt.id;
    await warte(TAKT_MS);
  }
  return null;
}

export function registriereRefresh(app: FastifyInstance, ctx: Kontext): void {
  app.post('/api/refresh', { schema: { response: { 202: ANTWORT_SCHEMA } } }, async (
    anfrage: FastifyRequest,
    antwort: FastifyReply,
  ) => {
    const lm = baueLesemodell(ctx.db, ctx.konfiguration, ctx.heute);
    const modul = await ladeIngest();
    const vorher = repository.lauf.letzter(ctx.db)?.id ?? null;

    // Wirft E_SPERRE (409) mit laufId, quelle und seit, wenn schon einer laeuft.
    ctx.sperre.nimm('api');

    let laufend: Promise<unknown>;
    try {
      laufend = modul.fuehreLaufAus({ db: ctx.db, konfiguration: ctx.konfiguration, heute: lm.heute });
    } catch (fehler) {
      ctx.sperre.gibFrei();
      throw fehler;
    }

    // Freigabe im finally — auch wenn der Lauf scheitert, darf die Sperre nicht liegenbleiben.
    void laufend
      .catch((fehler: unknown) => {
        app.log.error({ stelle: 'ingest' }, (fehler as Error)?.message ?? 'unbekannter Fehler');
      })
      .finally(() => {
        ctx.sperre.gibFrei();
      });

    const laufId = await warteAufLaufId(ctx.db, vorher);
    ctx.sperre.setzeLaufId(laufId);

    const antwortKoerper: RefreshAntwort = { laufId, ...umschlagAus(lm.stand(), lm.drift()) };
    return antwort.code(202).send(antwortKoerper);
  });
}
