/**
 * Eine Adresse im Standardbrowser oeffnen — plattformabhaengig, an genau einer Stelle.
 *
 * Steht neben `konfiguration.ts` in `shared/` und aus demselben Grund: drei Schichten
 * brauchen dasselbe — `start/start.ts` nach dem Serverstart, `start/demo.ts` fuer den
 * Screenshot-Lauf und `ingest/mcpAnmeldung.ts` fuer die PKCE-Anmeldung —, und keine davon
 * gehoert der anderen. Vorher stand die Funktion dreimal fast gleich da; mit dem
 * Windows-Zweig waere aus dreimal fast gleich dreimal unterschiedlich geworden.
 *
 * Zwei Eigenheiten, beide von der Plattform aufgezwungen:
 *
 *  - **Windows: `rundll32 url.dll,FileProtocolHandler`, nicht `explorer.exe`.** Explorer
 *    parst seine Kommandozeile selbst und erkennt eine lange Adresse mit Query
 *    (`?…&…%…`, wie die OAuth-Authorize-URL) nicht als URL — statt des Browsers geht der
 *    Dateimanager auf. `FileProtocolHandler` reicht die Adresse unverändert an den
 *    registrierten Handler. Dessen Exit-Code sagt nichts über den Erfolg; deshalb wird
 *    unter `win32` nicht hingesehen.
 *  - **Absoluter Pfad statt Name.** Wie `/usr/bin/open` unter macOS: gestartet wird die
 *    Datei, die gemeint ist, nicht die erste gleichen Namens im `PATH`.
 *
 * Argument-Array, nie eine Shell — die Adresse ist zwar immer selbst gebaut, aber die
 * Regel gilt hier wie ueberall sonst [INV-01].
 */

import { execFile } from 'node:child_process';
import { join } from 'node:path';

/** Wohin die Meldung geht, wenn sich nichts oeffnen laesst. Ersetzbar fuer Tests. */
export type Melder = (text: string) => void;

const AUSGABE: Melder = (text) => process.stdout.write(`${text}\n`);

/**
 * Der Oeffner dieser Plattform — `null`, wenn es keinen gibt. Getrennt von
 * `oeffneImBrowser`, damit ein Test die Entscheidung pruefen kann, ohne einen
 * Kindprozess zu starten.
 */
export function oeffnerFuer(
  plattform: NodeJS.Platform = process.platform,
  umgebung: NodeJS.ProcessEnv = process.env,
): { readonly befehl: string; readonly argumente: readonly string[]; readonly achteAufFehler: boolean } | null {
  if (plattform === 'darwin') return { befehl: '/usr/bin/open', argumente: [], achteAufFehler: true };
  if (plattform === 'win32') {
    const windows = umgebung['SystemRoot'];
    const wurzel = windows !== undefined && windows !== '' ? windows : 'C:\\Windows';
    // Siehe Kopf: kein `explorer.exe`, und der Exit-Code sagt nichts ueber den Erfolg.
    return {
      befehl: join(wurzel, 'System32', 'rundll32.exe'),
      argumente: ['url.dll,FileProtocolHandler'],
      achteAufFehler: false,
    };
  }
  return null;
}

/**
 * Oeffnet die Adresse, wenn die Plattform es kann. Sonst — und wenn es schiefgeht —
 * bleibt es bei einem Satz auf der Konsole: die Adresse steht dort und laesst sich von
 * Hand kopieren. Ein Fehlschlag hier darf nie den Aufrufer abbrechen.
 */
export function oeffneImBrowser(adresse: string, melde: Melder = AUSGABE): void {
  const oeffner = oeffnerFuer();
  if (oeffner === null) {
    melde(`Im Browser oeffnen: ${adresse}`);
    return;
  }
  execFile(oeffner.befehl, [...oeffner.argumente, adresse], (fehler) => {
    if (fehler !== null && oeffner.achteAufFehler) {
      melde(`Der Browser liess sich nicht oeffnen: ${adresse}`);
    }
  });
}
