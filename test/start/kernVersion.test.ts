import { describe, expect, it } from 'vitest';
import { leseKernVersion, setzeKernVersion, zielVersion } from '../../start/abdruck.ts';

describe('npm run kern:version [INV-10]', () => {
  it('setzt KERN_VERSION und laesst den Rest stehen', () => {
    const quelle = '/** Kopf */\nexport const KERN_VERSION = 39;\n';
    expect(leseKernVersion(quelle)).toBe(39);
    expect(setzeKernVersion(quelle, 40)).toBe('/** Kopf */\nexport const KERN_VERSION = 40;\n');
  });

  it('bricht ab, wenn die Zeile ihre Form verloren hat', () => {
    expect(() => leseKernVersion('export const KERN_VERSION: number = 39;\n')).toThrow(/KERN_VERSION/);
    expect(() => setzeKernVersion('export const KERN_VERSION: number = 39;\n', 40)).toThrow(/KERN_VERSION/);
  });

  it('erhoeht gegenueber origin/main genau einmal, auch beim zweiten Aufruf', () => {
    const erster = zielVersion(45, 45);
    expect(erster).toBe(46);
    expect(zielVersion(erster, 45)).toBe(46);
  });

  it('zieht ueber main hinaus, wenn main inzwischen selbst erhoeht hat', () => {
    expect(zielVersion(46, 46)).toBe(47);
    expect(zielVersion(45, 47)).toBe(48);
  });

  it('erhoeht ohne lesbare Basis blind um eins', () => {
    expect(zielVersion(45, undefined)).toBe(46);
  });
});
