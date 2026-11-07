/*
 * `npm run check` und `npm run check:kurz` muessen dieselbe Pruefung sein.
 *
 * Die Kette steht zweimal: als npm-Skript in package.json und als SCHRITTE in
 * start/pruefung.ts. Zwei Orte, weil npm sich ohne Shell nicht als Unterprozess starten
 * laesst — aber zwei Orte driften, und dann ist der kurze Weg stillschweigend weniger
 * wert als der lange. Dieser Test macht das Driften zu einem roten Lauf.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';
import { geaenderteSchritte, SCHRITTE, ZUSATZTESTS, zusatztests } from '../start/pruefung.ts';

const skripte = (
  JSON.parse(readFileSync(join(PROJEKTWURZEL, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

describe('check und check:kurz', () => {
  it('gehen dieselben Schritte in derselben Reihenfolge', () => {
    // "npm run -s typecheck && … && npm run -s test:abdeckung" -> [typecheck, lint, test:abdeckung]
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
      // tsc --noEmit | eslint . --max-warnings 0 | vitest run --coverage
      expect(skript).toBe(erwartet);
    }
  });

  it('laesst check:kurz auf start/pruefung.ts zeigen', () => {
    expect(skripte['check:kurz']).toContain('start/pruefung.ts');
  });
});

describe('check:geaendert', () => {
  it('typisiert alles, lintet nur die geaenderten Quelldateien, testet die betroffenen', () => {
    const schritte = geaenderteSchritte(['core/xirr.ts', 'src/App.tsx'], 'origin/main');
    expect(schritte.map((s) => [s.name, s.argumente.join(' ')])).toEqual([
      ['typecheck', '--noEmit'],
      ['lint', 'core/xirr.ts src/App.tsx --max-warnings 0'],
      ['test', 'run --changed origin/main --passWithNoTests'],
      ['test:zusatz', 'run test/invarianten/ test/drittlizenzen.test.ts test/konfiguration.test.ts'],
    ]);
  });

  it('laesst eslint und Zusatztests ohne geaenderte Datei weg — sonst liefe das ganze Projekt', () => {
    expect(geaenderteSchritte([]).map((s) => s.name)).toEqual(['typecheck', 'test']);
  });

  // Beide Faelle meldeten vor der Pfadtabelle gruen, obwohl inv-10 bzw. der Kontrasttest rot war.
  it('faehrt INV-10 bei einer Kernaenderung, die kein Test importiert', () => {
    expect(zusatztests(['core/xirr.ts'])).toContain('test/invarianten/');
  });

  it('faehrt Kontrast- und Farbtests bei einer Aenderung an theme.css, ohne eslint', () => {
    const schritte = geaenderteSchritte(['src/styles/theme.css']);
    expect(schritte.map((s) => s.name)).toEqual(['typecheck', 'test', 'test:zusatz']);
    expect(schritte.at(-1)?.argumente).toEqual([
      'run',
      'test/invarianten/',
      'test/ui/farben.test.ts',
      'test/ui/VerlaufVorschau.test.tsx',
    ]);
  });

  it('zeigt in der Pfadtabelle nur auf Tests, die es gibt', () => {
    for (const test of ZUSATZTESTS.flatMap((z) => z.tests)) {
      expect(existsSync(join(PROJEKTWURZEL, test)), test).toBe(true);
    }
  });
});
