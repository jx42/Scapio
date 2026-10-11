/**
 * Eigene Dateien aus dem Projektordner ins Datenverzeichnis holen — einmalig, beim Start.
 * [ADR-037]
 *
 * Bis ADR-037 lagen `ingest/funds.json` und die eigenen Werte in `config.json` im
 * Projektordner, bis ADR-041 auch `ingest/seed.json`. Ein neu entpacktes ZIP hatte sie nicht mehr. Wer in-place aktualisiert
 * (Git) oder die Dateien beim letzten Mal noch von Hand mitgenommen hat, hat sie hier
 * noch — dann zieht dieser Schritt sie um, und danach sind sie update-fest.
 *
 * Nie ueberschreiben: liegt im Datenverzeichnis schon eine Datei, gilt sie.
 */

import { chmodSync, constants, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Konfiguration } from '../shared/konfiguration.ts';
import {
  EINSTELLUNGSFELDER,
  einstellungenPfad,
  fondsPfad,
  leseJsonDatei,
  PROJEKTWURZEL,
  seedPfad,
  vorgaben,
} from '../shared/konfiguration.ts';

function verzeichnisAnlegen(pfad: string): void {
  mkdirSync(pfad, { recursive: true, mode: 0o700 });
}

function nurFuerMich(datei: string): void {
  try {
    chmodSync(datei, 0o600);
  } catch {
    // Unter Windows ohne Wirkung, und eine fremde Datei ist kein Grund abzubrechen.
  }
}

/** Die Felder aus `config.json`, die von der Vorgabe abweichen und `einstellungen.json` setzen darf. */
export function eigeneWerte(roh: unknown): Record<string, unknown> {
  if (typeof roh !== 'object' || roh === null) return {};
  const v = vorgaben() as Record<string, unknown>;
  const eigene: Record<string, unknown> = {};
  for (const feld of EINSTELLUNGSFELDER) {
    const wert = (roh as Record<string, unknown>)[feld];
    if (wert !== undefined && JSON.stringify(wert) !== JSON.stringify(v[feld])) eigene[feld] = wert;
  }
  return eigene;
}

/** Liefert die Saetze fuer die Konsole (nur ASCII, wie alles im cmd-Fenster) — leer, wenn es nichts zu tun gab. */
export function uebernimmEigeneDateien(k: Konfiguration, projektwurzel = PROJEKTWURZEL): string[] {
  const saetze: string[] = [];

  for (const [datei, neu, was] of [
    ['funds.json', fondsPfad(k), 'Eigene Fondsliste'],
    ['seed.json', seedPfad(k), 'Anfangsbestand'],
  ] as const) {
    const alt = join(projektwurzel, 'ingest', datei);
    if (!existsSync(alt)) continue;
    if (existsSync(neu)) {
      saetze.push(`📦  ingest/${datei} wird nicht mehr gelesen — es gilt ${neu}. Die alte Datei kann weg.`);
    } else {
      verzeichnisAnlegen(k.datenpfad);
      copyFileSync(alt, neu, constants.COPYFILE_EXCL);
      nurFuerMich(neu);
      rmSync(alt);
      saetze.push(`📦  ${was} verschoben: ingest/${datei} nach ${neu}`);
    }
  }

  const neuEinstellungen = einstellungenPfad(k);
  if (!existsSync(neuEinstellungen)) {
    const eigene = eigeneWerte(leseJsonDatei(join(projektwurzel, 'config.json'), 'config.json'));
    if (Object.keys(eigene).length > 0) {
      verzeichnisAnlegen(k.datenpfad);
      writeFileSync(neuEinstellungen, `${JSON.stringify(eigene, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      saetze.push(
        `📦  Eigene Einstellungen aus config.json uebernommen (${Object.keys(eigene).join(', ')}) nach ${neuEinstellungen}`,
        '    Kuenftig dort aendern, dann ueberleben sie jedes Update.',
      );
    }
  }

  return saetze;
}
