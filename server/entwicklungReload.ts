/**
 * Neulade-Kanal fuer `npm run dev` und `npm run demo`: sobald `vite build --watch`
 * `dist/index.html` neu schreibt, schickt der Server jedem offenen Tab ein
 * Server-Sent-Event, und das Skript unten laedt die Seite neu. Reine
 * Entwicklerbequemlichkeit — `npm start` uebergibt `neuladen` nie, dieser Code laeuft
 * dort nie.
 *
 * Kein `fs.watch`: `dist/` existiert beim Start von `npm run dev` oft noch nicht (der
 * Bau-Kindprozess laeuft parallel dazu), und `fs.watch(..., { recursive: true })`
 * verhaelt sich je Plattform unterschiedlich. Stattdessen ein Intervall auf die
 * Aenderungszeit von `dist/index.html` — Vite schreibt diese Datei bei JEDEM Bau neu,
 * siehe `server.ts`.
 *
 * Ein Neustart des Servers selbst (Aenderung an `server/`, `core/` oder `db/`, per
 * `node --watch`) reisst die Verbindung ab; das Skript verbindet automatisch neu und
 * wertet genau dieses Wiederverbinden ebenfalls als "neu laden".
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';

const PRUEF_ABSTAND_MS = 300;

export const NEULADE_SKRIPT_TAG = '<script src="/__reload.js"></script>';

const NEULADE_SKRIPT = `(function () {
  var verbunden = false;
  function starte() {
    var quelle = new EventSource('/__reload');
    quelle.onopen = function () {
      if (verbunden) { quelle.close(); location.reload(); return; }
      verbunden = true;
    };
    quelle.onmessage = function () { quelle.close(); location.reload(); };
    quelle.onerror = function () { quelle.close(); setTimeout(starte, 300); };
  }
  starte();
})();
`;

function indexAenderungszeit(distPfad: string): number {
  const indexPfad = join(distPfad, 'index.html');
  if (!existsSync(indexPfad)) return 0;
  return statSync(indexPfad).mtimeMs;
}

export function registriereEntwicklungReload(app: FastifyInstance, distPfad: string): void {
  const clients = new Set<Readable>();
  let letzteAenderung = indexAenderungszeit(distPfad);

  const intervall = setInterval(() => {
    const aktuell = indexAenderungszeit(distPfad);
    if (aktuell === letzteAenderung) return;
    letzteAenderung = aktuell;
    for (const strom of clients) strom.push('data: reload\n\n');
  }, PRUEF_ABSTAND_MS);

  app.get('/__reload.js', (_anfrage, antwort) => {
    antwort.type('application/javascript; charset=utf-8').send(NEULADE_SKRIPT);
  });

  app.get('/__reload', (anfrage, antwort) => {
    const strom = new Readable({ read() {} });
    clients.add(strom);
    anfrage.raw.on('close', () => {
      clients.delete(strom);
      strom.push(null);
    });
    antwort.type('text/event-stream').send(strom);
  });

  app.addHook('onClose', (_instance, fertig) => {
    clearInterval(intervall);
    for (const strom of clients) strom.push(null);
    clients.clear();
    fertig();
  });
}
