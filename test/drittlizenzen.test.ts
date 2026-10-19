/**
 * Die Lizenzdatei der Oberfläche: welche Modul-IDs zu welchem Paket gehören und dass der Text
 * je Paket Version, Lizenz und Lizenzdatei trägt. [ADR-055]
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { DRITTLIZENZEN_DATEI, lizenztext, paketAusModul } from '../shared/drittlizenzen.ts';

describe('paketAusModul', () => {
  it('liest einfache, gescopte und verschachtelte Pakete', () => {
    expect(paketAusModul('/p/node_modules/clsx/dist/clsx.mjs')).toEqual({ name: 'clsx', ordner: '/p/node_modules/clsx' });
    expect(paketAusModul('/p/node_modules/@radix-ui/react-tabs/dist/index.mjs')?.name).toBe('@radix-ui/react-tabs');
    expect(paketAusModul('/p/node_modules/a/node_modules/b/index.js')).toEqual({
      name: 'b',
      ordner: '/p/node_modules/a/node_modules/b',
    });
  });

  it('nimmt CommonJS-Hüllen, Windows-Pfade und Query an', () => {
    expect(paketAusModul('\0/p/node_modules/eventemitter3/index.js?commonjs-module')?.ordner).toBe(
      '/p/node_modules/eventemitter3',
    );
    expect(paketAusModul('C:\\p\\node_modules\\react\\index.js')?.name).toBe('react');
  });

  it('eigener Code ist kein Paket', () => {
    expect(paketAusModul('/p/src/App.tsx')).toBeNull();
    expect(paketAusModul('\0vite/preload-helper.js')).toBeNull();
  });
});

describe('lizenztext', () => {
  const ordner: string[] = [];
  afterEach(() => ordner.splice(0).forEach((o) => rmSync(o, { recursive: true, force: true })));

  function paket(name: string, json: object, lizenz?: string): string {
    const wurzel = mkdtempSync(join(tmpdir(), 'scapio-lizenz-'));
    ordner.push(wurzel);
    const o = join(wurzel, 'node_modules', name);
    mkdirSync(o, { recursive: true });
    writeFileSync(join(o, 'package.json'), JSON.stringify(json));
    if (lizenz !== undefined) writeFileSync(join(o, 'LICENSE.md'), lizenz);
    return o;
  }

  it('sortiert nach Namen, mit Version, Lizenz und Text', () => {
    const text = lizenztext(
      new Map([
        ['zeta', paket('zeta', { version: '2.0.0', license: 'ISC' }, 'ISC-Text')],
        ['@a/b', paket('@a/b', { version: '1.0.0', license: 'MIT' }, 'MIT-Text')],
      ]),
    );
    expect(text.indexOf('@a/b 1.0.0 — MIT')).toBeLessThan(text.indexOf('zeta 2.0.0 — ISC'));
    expect(text).toContain('MIT-Text');
    expect(text).toContain('ISC-Text');
  });

  it('ein Paket ohne Lizenzdatei wird genannt, nicht übergangen', () => {
    const text = lizenztext(new Map([['nackt', paket('nackt', { version: '1.0.0' })]]));
    expect(text).toContain('nackt 1.0.0 — Lizenz nicht angegeben');
    expect(text).toContain('keinen eigenen Lizenztext');
  });
});

it('die Demo verlinkt genau die Datei, die der Bau schreibt', () => {
  expect(readFileSync(join(import.meta.dirname, '../src/App.tsx'), 'utf8')).toContain(`href="/${DRITTLIZENZEN_DATEI}"`);
});
