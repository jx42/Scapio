/*
 * `npm run check` und `npm run check:kurz` muessen dieselbe Pruefung sein.
 *
 * Die Kette steht zweimal: als npm-Skript in package.json und als SCHRITTE in
 * start/pruefung.ts. Zwei Orte, weil npm sich ohne Shell nicht als Unterprozess starten
 * laesst — aber zwei Orte driften, und dann ist der kurze Weg stillschweigend weniger
 * wert als der lange. Dieser Test macht das Driften zu einem roten Lauf.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';
import { SCHRITTE } from '../start/pruefung.ts';

const skripte = (
  JSON.parse(readFileSync(join(PROJEKTWURZEL, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

describe('check und check:kurz', () => {
  it('gehen dieselben Schritte in derselben Reihenfolge', () => {
    // "npm run -s typecheck && npm run -s lint && npm run -s test" -> [typecheck, lint, test]
    const ausSkript = (skripte.check ?? '')
      .split('&&')
      .map((teil) => teil.trim().replace(/^npm run (-s )?/, ''));

    expect(ausSkript).toEqual(SCHRITTE.map((s) => s.name));
  });

  it('ruft je Schritt dasselbe Werkzeug mit denselben Argumenten auf wie das npm-Skript', () => {
    for (const schritt of SCHRITTE) {
      const skript = skripte[schritt.name];
      expect(skript, `package.json kennt kein Skript "${schritt.name}"`).toBeDefined();

      const erwartet = [schritt.werkzeug, ...schritt.argumente].join(' ');
      // tsc --noEmit | eslint . --max-warnings 0 | vitest run
      expect(skript).toBe(erwartet);
    }
  });

  it('laesst check:kurz auf start/pruefung.ts zeigen', () => {
    expect(skripte['check:kurz']).toContain('start/pruefung.ts');
  });
});
