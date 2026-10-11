/**
 * Gemeinsames Werkzeug der Invariantentests: welche Dateien gehoeren zum Projekt,
 * und was steht darin.
 *
 * Die Invarianten sind Aussagen ueber den Quelltext, nicht nur ueber das Verhalten —
 * INV-02 etwa verbietet `parseFloat` ueberall, nicht nur dort, wo gerade ein Test
 * hinsieht. Also wird der Quelltext gelesen.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ueber `fileURLToPath`, nicht ueber `.pathname`: Letzteres liefert unter Windows
 * `/C:/…` — mit fuehrendem Schraegstrich und prozentkodierten Sonderzeichen. `join`
 * macht daraus `\C:\…`, `statSync` findet nichts, `dateien()` gibt eine leere Liste
 * zurueck, und die Invarianten waeren dort nicht rot, sondern gegenstandslos.
 */
export const WURZEL = fileURLToPath(new URL('../../', import.meta.url)).replace(/[/\\]$/, '');

const UEBERSPRINGEN = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
  '.vite',
  'playwright-report',
  'test-results',
]);

export type Quelldatei = {
  /** Pfad relativ zur Projektwurzel, mit `/`. */
  readonly pfad: string;
  readonly inhalt: string;
};

function sammle(verzeichnis: string, endungen: readonly string[], gefunden: string[]): void {
  for (const eintrag of readdirSync(verzeichnis)) {
    if (UEBERSPRINGEN.has(eintrag) || eintrag.startsWith('.')) continue;
    const voll = join(verzeichnis, eintrag);
    if (statSync(voll).isDirectory()) sammle(voll, endungen, gefunden);
    else if (endungen.some((e) => eintrag.endsWith(e))) gefunden.push(voll);
  }
}

/** Alle Quelldateien unter den genannten Verzeichnissen, relativ zur Wurzel. */
export function dateien(
  verzeichnisse: readonly string[],
  endungen: readonly string[] = ['.ts', '.tsx'],
): Quelldatei[] {
  const gefunden: string[] = [];
  for (const v of verzeichnisse) {
    const voll = join(WURZEL, v);
    try {
      if (statSync(voll).isDirectory()) sammle(voll, endungen, gefunden);
      else gefunden.push(voll);
    } catch {
      // Ein Verzeichnis, das es (noch) nicht gibt, ist kein Verstoss.
    }
  }
  return gefunden
    .map((p) => ({ pfad: relative(WURZEL, p).replaceAll('\\', '/'), inhalt: readFileSync(p, 'utf8') }))
    .sort((a, b) => (a.pfad < b.pfad ? -1 : 1));
}

/** Konfiguration der Werkzeuge, nicht der Anwendung — sie laeuft nie im ausgelieferten Code. */
const WERKZEUG_KONFIGURATION = /\.config\.ts$/;

/**
 * Alles ausser Tests: was ausgeliefert wird. Wurzelmodule werden abgeleitet statt
 * aufgezaehlt — ein neues Modul dort faellt sonst unbemerkt aus jeder Invariante.
 */
export const AUSGELIEFERT = [
  'core',
  'db',
  'ingest',
  'server',
  'shared',
  'src',
  'start',
  ...readdirSync(WURZEL)
    .filter((d) => d.endsWith('.ts') && !WERKZEUG_KONFIGURATION.test(d))
    .sort(),
];

export type Treffer = { readonly pfad: string; readonly zeile: number; readonly text: string };

/** Zeilen, auf die `muster` passt — ohne Zeilen, die als Ausnahme markiert sind. */
export function suche(quellen: readonly Quelldatei[], muster: RegExp): Treffer[] {
  const treffer: Treffer[] = [];
  for (const q of quellen) {
    const zeilen = q.inhalt.split('\n');
    for (let i = 0; i < zeilen.length; i += 1) {
      const text = zeilen[i]!;
      if (!new RegExp(muster.source, muster.flags.replace('g', '')).test(text)) continue;
      // Eine bewusste Ausnahme steht als Kommentar in derselben Zeile.
      if (text.includes('INV-AUSNAHME')) continue;
      treffer.push({ pfad: q.pfad, zeile: i + 1, text: text.trim() });
    }
  }
  return treffer;
}

/**
 * Eine Zeile, die nur Kommentar ist. Regeln, die ein verbotenes Muster beschreiben
 * duerfen — der Quelltext erklaert seine eigenen Regeln, und dabei muss er das
 * Verbotene nennen koennen —, suchen damit nur im Code.
 *
 * Bewusst grob: ein Blockkommentar, dessen Fortsetzungszeilen kein `*` tragen,
 * gilt als Code. Lieber ein Fund zu viel als eine Regel, die sich austricksen laesst.
 */
function nurKommentar(text: string): boolean {
  const t = text.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/** Wie `suche`, aber blind fuer Zeilen, die ausschliesslich Kommentar sind. */
export function sucheImCode(quellen: readonly Quelldatei[], muster: RegExp): Treffer[] {
  return suche(quellen, muster).filter((t) => !nurKommentar(t.text));
}

/** Fuer die Fehlermeldung: Datei, Zeile, Fundstelle — damit man hingehen kann. */
export function alsListe(treffer: readonly Treffer[]): string {
  return treffer.map((t) => `  ${t.pfad}:${t.zeile}  ${t.text}`).join('\n');
}

/** Jede Registrierung einer Route, wie Fastify sie sieht. */
export function registrierteRouten(): { methode: string; pfad: string; datei: string; zeile: number }[] {
  const gefunden: { methode: string; pfad: string; datei: string; zeile: number }[] = [];
  for (const q of dateien(['server'])) {
    const zeilen = q.inhalt.split('\n');
    for (let i = 0; i < zeilen.length; i += 1) {
      const t = /\bapp\s*\.\s*(get|post|put|patch|delete|head|options|all|route)\s*\(\s*(?:\{\s*)?['"]([^'"]+)['"]/.exec(zeilen[i]!);
      if (t !== null) gefunden.push({ methode: t[1]!, pfad: t[2]!, datei: q.pfad, zeile: i + 1 });
    }
  }
  return gefunden;
}
