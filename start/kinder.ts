/**
 * Der gemeinsame Rahmen von `npm run dev` und `npm run demo`: `vite build --watch` schreibt
 * bei jeder Aenderung nach `dist/`, ein Server laeuft unter `node --watch` auf demselben
 * einen Port. Warum kein Vite-Entwicklungsserver, steht in `start/dev.ts`.
 *
 * Beide Kinder werden mit Argument-Array gestartet, nie ueber eine Shell. Der Browser oeffnet
 * nur HIER, einmal, nicht bei jedem Neustart des Server-Kindes — dafuer wird auf den Port
 * gewartet, statt eine feste Verzoegerung zu raten.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';
import { oeffneImBrowser } from '../shared/browser.ts';
import { werkzeugArgumente } from './werkzeuge.ts';

/** So lange darf ein Verbindungsversuch auf den eigenen Port dauern. */
const PORTPRUEFUNG_MS = 400;
const WARTE_ZEITLIMIT_MS = 20_000;
const WARTE_ABSTAND_MS = 200;

/**
 * Hoert auf dem Port schon jemand? Ein reiner Verbindungsversuch, kein HTTP: gefragt ist
 * genau das, woran `start.ts` sonst mit `EADDRINUSE` scheitert.
 */
export function portBelegt(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((fertig) => {
    const verbindung = createConnection({ port, host });
    const antwort = (belegt: boolean): void => {
      verbindung.destroy();
      fertig(belegt);
    };
    verbindung.setTimeout(PORTPRUEFUNG_MS);
    verbindung.once('connect', () => {
      antwort(true);
    });
    verbindung.once('timeout', () => {
      antwort(false);
    });
    verbindung.once('error', () => {
      antwort(false);
    });
  });
}

async function warteUndOeffneBrowser(port: number): Promise<void> {
  const anfang = Date.now();
  while (Date.now() - anfang < WARTE_ZEITLIMIT_MS) {
    if (await portBelegt(port)) {
      oeffneImBrowser(`http://127.0.0.1:${String(port)}`);
      return;
    }
    await new Promise((fertig) => setTimeout(fertig, WARTE_ABSTAND_MS));
  }
}

/** `serverArgs` ohne `--watch` — das setzt diese Funktion davor. */
export function starteMitWatch(serverArgs: readonly string[], port: number): void {
  const kinder: ChildProcess[] = [];

  const bau = spawn(process.execPath, werkzeugArgumente('vite', 'build', '--watch'), {
    cwd: PROJEKTWURZEL,
    stdio: 'inherit',
  });
  kinder.push(bau);

  const server = spawn(process.execPath, ['--watch', ...serverArgs], { cwd: PROJEKTWURZEL, stdio: 'inherit' });
  kinder.push(server);

  const beenden = (): void => {
    for (const kind of kinder) kind.kill('SIGTERM');
  };
  process.on('SIGINT', beenden);
  process.on('SIGTERM', beenden);

  server.on('exit', (code) => {
    bau.kill('SIGTERM');
    process.exitCode = code ?? 0;
  });

  void warteUndOeffneBrowser(port);
}
