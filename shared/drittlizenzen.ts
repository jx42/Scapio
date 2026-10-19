/**
 * Lizenztexte der Pakete, die im gebauten Bundle stecken, als `assets/drittlizenzen.txt`.
 * Die öffentliche Demo verteilt dieses Bundle; MIT, ISC und OFL verlangen, dass der
 * Lizenztext mitgeht. Gelesen wird aus den Modulen, die Rollup wirklich eingebunden hat —
 * nicht aus `package.json`, das auch Server- und Bauwerkzeuge listet. [ADR-055]
 *
 * Kein Hash im Namen: `istUnveraenderlich` gäbe der Datei sonst ein Jahr Cache.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

export const DRITTLIZENZEN_DATEI = 'assets/drittlizenzen.txt';

/** Die Schrift kommt als CSS-Asset ins Bundle, nicht als Modul — sie steht deshalb fest dabei. */
const IMMER = { '@fontsource-variable/geist': 'node_modules/@fontsource-variable/geist' } as const;

/**
 * Paketname und -ordner aus einer Modul-ID; bei verschachtelten `node_modules` das innerste Paket.
 * Das `\0` vorn tragen die CommonJS-Hüllen von Rollup — das Paket dahinter steckt trotzdem im Bundle.
 */
export function paketAusModul(id: string): { readonly name: string; readonly ordner: string } | null {
  const pfad = id.replace(/^\0/, '').replace(/\\/g, '/').split('?')[0] ?? '';
  const stelle = pfad.lastIndexOf('/node_modules/');
  if (stelle === -1) return null;
  const [erster, zweiter] = pfad.slice(stelle + '/node_modules/'.length).split('/');
  if (erster === undefined || erster === '') return null;
  const name = erster.startsWith('@') && zweiter !== undefined ? `${erster}/${zweiter}` : erster;
  return { name, ordner: `${pfad.slice(0, stelle)}/node_modules/${name}` };
}

function lizenzDatei(ordner: string): string | null {
  const name = readdirSync(ordner).find((d) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(d));
  return name === undefined ? null : readFileSync(join(ordner, name), 'utf8').trim();
}

/** Ein Abschnitt je Paket, nach Namen sortiert. `ordner` je Name, wie `paketAusModul` ihn liefert. */
export function lizenztext(pakete: ReadonlyMap<string, string>): string {
  const abschnitte = [...pakete.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, ordner]) => {
      const beschreibung = JSON.parse(readFileSync(join(ordner, 'package.json'), 'utf8')) as {
        version?: string;
        license?: string;
      };
      const kopf = `${name} ${beschreibung.version ?? ''} — ${beschreibung.license ?? 'Lizenz nicht angegeben'}`;
      return `${kopf}\n${'-'.repeat(kopf.length)}\n\n${lizenzDatei(ordner) ?? '(Das Paket liefert keinen eigenen Lizenztext mit.)'}`;
    });
  return [
    'Scapio — Lizenzen der Pakete Dritter in der Oberfläche',
    '',
    'Scapio selbst steht unter der MIT-Lizenz: https://github.com/jx42/Scapio/blob/main/LICENSE',
    '',
    ...abschnitte.flatMap((a) => [a, '', '']),
  ].join('\n');
}

export function drittlizenzen(wurzel: string): Plugin {
  return {
    name: 'scapio-drittlizenzen',
    apply: 'build',
    generateBundle(_optionen, bundle) {
      const pakete = new Map<string, string>();
      for (const [name, ordner] of Object.entries(IMMER)) {
        if (existsSync(join(wurzel, ordner))) pakete.set(name, join(wurzel, ordner));
      }
      for (const teil of Object.values(bundle)) {
        if (teil.type !== 'chunk') continue;
        for (const id of Object.keys(teil.modules)) {
          const paket = paketAusModul(id);
          if (paket !== null && !pakete.has(paket.name)) pakete.set(paket.name, paket.ordner);
        }
      }
      this.emitFile({ type: 'asset', fileName: DRITTLIZENZEN_DATEI, source: lizenztext(pakete) });
    },
  };
}
