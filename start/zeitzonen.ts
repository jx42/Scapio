/**
 * `npm run test:tz` — dieselbe Suite unter drei Zeitzonen. [INV-03]
 *
 * Vorher stand das als `TZ=UTC vitest run && TZ=… vitest run && …` in `package.json`.
 * Diese Schreibweise ist POSIX: `cmd.exe` kennt kein vorangestelltes `NAME=WERT` und
 * versucht, ein Programm namens `TZ=UTC` zu starten. Damit war die wichtigste Pruefung
 * dieses Projekts genau auf der Plattform nicht lauffaehig, auf der Datum und Zeitzone
 * am ehesten anders sind — und `windows-latest` konnte deshalb nicht in die CI-Matrix.
 *
 * Der naheliegende Ausweg waere `cross-env`. Das waere eine weitere Abhaengigkeit fuer
 * eine Zeile, die dieses Projekt selbst schreiben kann: `process.env.TZ` setzen und
 * vitest als Kindprozess starten — ohne Shell, mit Argument-Array, wie jeder andere
 * Unterprozess hier auch.
 *
 * Die drei Zonen sind mit Absicht extrem: UTC als Bezug, `America/Los_Angeles` liegt
 * hinter Berlin (dort ist der Berliner Tag schon angebrochen, der lokale noch nicht),
 * `Pacific/Kiritimati` mit UTC+14 davor. Ein Tagesschluss, der nur in Berlin richtig
 * faellt, faellt unter mindestens einer dieser drei falsch.
 *
 * Die CI uebergibt nur zwei Zonen als Argumente: ihre Runner stehen schon auf UTC. [ADR-050]
 * Eine unbekannte Zone wird abgelehnt — Node fiele sonst still auf UTC zurueck, und der
 * Lauf waere gruen, ohne etwas geprueft zu haben.
 *
 * Abgebrochen wird beim ersten Fehlschlag: die zweite Zone sagt nichts Neues, solange
 * die erste rot ist, und der Fehler soll oben in der Ausgabe stehen, nicht in der Mitte.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';
import { werkzeugArgumente } from './werkzeuge.ts';

const ZONEN: readonly string[] = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati'];

function istZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function haupt(zonen: readonly string[] = ZONEN): void {
  const unbekannt = zonen.filter((z) => !istZone(z));
  if (unbekannt.length > 0) {
    process.stderr.write(`Unbekannte Zeitzone: ${unbekannt.join(', ')}\n`);
    process.exitCode = 1;
    return;
  }
  for (const zone of zonen) {
    process.stdout.write(`\n── vitest unter TZ=${zone} ──\n`);
    const lauf = spawnSync(process.execPath, werkzeugArgumente('vitest', 'run'), {
      cwd: PROJEKTWURZEL,
      stdio: 'inherit',
      // Die Umgebung dieses Prozesses, aber mit gesetzter Zone: vitest startet selbst
      // Worker-Prozesse, und die erben `TZ` nur, wenn es hier drinsteht.
      env: { ...process.env, TZ: zone },
    });

    if (lauf.error !== undefined) {
      process.stderr.write(`vitest liess sich nicht starten: ${lauf.error.message}\n`);
      process.exitCode = 1;
      return;
    }
    if (lauf.status !== 0) {
      process.stderr.write(`\nDie Suite ist unter TZ=${zone} nicht gruen geworden.\n`);
      process.exitCode = lauf.status ?? 1;
      return;
    }
  }
  process.stdout.write(`\nAlle ${String(zonen.length)} Zeitzonen gruen.\n`);
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  const argumente = process.argv.slice(2);
  haupt(argumente.length > 0 ? argumente : ZONEN);
}
