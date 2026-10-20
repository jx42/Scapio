/**
 * Die Mindestversion von Node steht sechsmal von Hand in den Doppelklick-Dateien, weil
 * diese pruefen muessen, bevor Node laeuft — und einmal in `start/nodeVersion.mjs`. Alle
 * muessen `engines` in package.json folgen.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJEKTWURZEL } from '../../shared/konfiguration.ts';

const lies = (datei: string): string => readFileSync(join(PROJEKTWURZEL, datei), 'utf8');

const engines = (JSON.parse(lies('package.json')) as { engines: { node: string } }).engines.node;
const MINDEST = /^>=(\d+)\.0\.0$/.exec(engines)?.[1];

const FUNDSTELLEN: Record<string, RegExp> = {
  'Start.command': /^\s*MINDEST_NODE=(\d+)$/m,
  'Aktualisieren.command': /^\s*MINDEST_NODE=(\d+)$/m,
  'Deinstallieren.command': /^\s*MINDEST_NODE=(\d+)$/m,
  'Start.bat': /^set "MINDEST_NODE=(\d+)"\r?$/m,
  'Aktualisieren.bat': /^set "MINDEST_NODE=(\d+)"\r?$/m,
  'Deinstallieren.bat': /^set "MINDEST_NODE=(\d+)"\r?$/m,
  'start/nodeVersion.mjs': /^const MINDEST_NODE = (\d+);$/m,
};

describe('Mindestversion von Node', () => {
  it('steht in package.json als ganze Hauptversion', () => {
    expect(MINDEST, engines).toBeDefined();
  });

  for (const [datei, muster] of Object.entries(FUNDSTELLEN)) {
    it(`${datei} folgt engines`, () => {
      expect(muster.exec(lies(datei))?.[1], datei).toBe(MINDEST);
    });
  }
});
