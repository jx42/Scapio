/*
 * Die Schwellen aus vite.config.ts greifen nur, wo sie hinzeigen: ein neuer Quellordner ohne
 * Eintrag in ABDECKUNG faellt still aus der Messung, ein Glob ohne Treffer gilt als 100 %.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';
import { ABDECKUNG, BUNDLE_KB } from '../vite.config.ts';

/** Ordner im tsconfig, die nicht ausgeliefert werden oder keine eigenen Tests haben. */
const OHNE_ABDECKUNG = ['test', 'demo-worker', '*.ts'];

describe('Abdeckung je Ordner', () => {
  it('hat fuer jeden Quellordner aus tsconfig.json eine Schwelle und keine fuer andere', () => {
    const tsconfig = JSON.parse(readFileSync(join(PROJEKTWURZEL, 'tsconfig.json'), 'utf8')) as {
      include: string[];
    };
    const quellordner = tsconfig.include.filter((o) => !OHNE_ABDECKUNG.includes(o)).sort();
    expect(Object.keys(ABDECKUNG).sort()).toEqual(quellordner);
    for (const ordner of quellordner) {
      expect(statSync(join(PROJEKTWURZEL, ordner)).isDirectory(), ordner).toBe(true);
    }
  });
});

describe('Bundle-Budget', () => {
  it(`haelt jeden JS-Chunk in dist/ unter ${String(BUNDLE_KB)} kB`, () => {
    const assets = join(PROJEKTWURZEL, 'dist', 'assets');
    if (!existsSync(assets)) return; // Vor dem ersten Bauen gibt es nichts zu pruefen; die CI baut vorher.
    for (const datei of readdirSync(assets).filter((d) => d.endsWith('.js'))) {
      expect(statSync(join(assets, datei)).size, datei).toBeLessThanOrEqual(BUNDLE_KB * 1000);
    }
  });
});
