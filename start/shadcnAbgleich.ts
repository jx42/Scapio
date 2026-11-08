/**
 * `npm run shadcn:abgleich`: zaehlt je Datei in `src/components/ui/` die Zeilen, die vom
 * Registry-Stand `new-york-v4` abweichen (ADR-024). Einziger Netzzugriff dieses Ordners —
 * deshalb nie aus `check` oder einem Test heraus, nur auf Aufruf.
 *
 * Verglichen wird nach Normalisierung: Anfuehrungszeichen, Semikolon am Zeilenende, Leerraum
 * und reine Kommentarzeilen zaehlen nicht, sonst ginge jede Abweichung im Formatierungsrauschen
 * unter. Was bleibt, soll in der Tabelle von ADR-024 stehen.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI = fileURLToPath(new URL('../src/components/ui/', import.meta.url));
const REGISTRY = 'https://ui.shadcn.com/r/styles/new-york-v4';
/** Ohne Gegenstueck in der Registry (ADR-024, Zeile `trigger`). */
const EIGENE = new Set(['trigger']);

export function normalisiert(quelltext: string): string[] {
  return quelltext
    .split('\n')
    .map((z) => z.replace(/"/g, "'").replace(/\s+/g, ' ').trim().replace(/;$/, ''))
    .filter((z) => z !== '' && !/^(\/\/|\/\*|\*)/.test(z) && z !== "'use client'");
}

/** Zeilen nur hier und nur dort, ueber die laengste gemeinsame Teilfolge. */
export function abweichung(hier: readonly string[], dort: readonly string[]): { nurHier: number; nurDort: number } {
  let vorher = new Array<number>(dort.length + 1).fill(0);
  for (const zeile of hier) {
    const jetzt = [0];
    for (let j = 0; j < dort.length; j++) {
      jetzt.push(zeile === dort[j] ? vorher[j]! + 1 : Math.max(vorher[j + 1]!, jetzt[j]!));
    }
    vorher = jetzt;
  }
  const gemeinsam = vorher[dort.length]!;
  return { nurHier: hier.length - gemeinsam, nurDort: dort.length - gemeinsam };
}

/** Der Inhalt der ersten Datei eines Registry-Eintrags, oder null bei unerwarteter Form. */
export function registryInhalt(json: unknown): string | null {
  if (typeof json !== 'object' || json === null || !('files' in json) || !Array.isArray(json.files)) return null;
  const datei: unknown = json.files[0];
  if (typeof datei !== 'object' || datei === null || !('content' in datei)) return null;
  return typeof datei.content === 'string' ? datei.content : null;
}

async function haupt(): Promise<void> {
  const dateien = readdirSync(UI).filter((d) => /\.tsx?$/.test(d) && !EIGENE.has(d.replace(/\.tsx?$/, '')));
  let fehler = false;
  for (const datei of dateien.sort()) {
    const name = datei.replace(/\.tsx?$/, '');
    const antwort = await fetch(`${REGISTRY}/${name}.json`, { signal: AbortSignal.timeout(15_000) });
    const inhalt = antwort.ok ? registryInhalt(await antwort.json()) : null;
    if (inhalt === null) {
      process.stdout.write(`${datei.padEnd(20)} nicht in der Registry (HTTP ${antwort.status})\n`);
      fehler = true;
      continue;
    }
    const { nurHier, nurDort } = abweichung(normalisiert(readFileSync(join(UI, datei), 'utf8')), normalisiert(inhalt));
    process.stdout.write(`${datei.padEnd(20)} ${String(nurHier + nurDort).padStart(4)} Zeilen  (+${nurHier} hier, -${nurDort} Registry)\n`);
  }
  if (fehler) process.exitCode = 1;
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) await haupt();
