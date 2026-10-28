import { describe, expect, it } from 'vitest';
import { erhoeheKernVersion } from '../../start/abdruck.ts';

describe('npm run kern:version [INV-10]', () => {
  it('hebt KERN_VERSION um eins und laesst den Rest stehen', () => {
    const quelle = '/** Kopf */\nexport const KERN_VERSION = 39;\n';
    expect(erhoeheKernVersion(quelle)).toEqual({
      quelle: '/** Kopf */\nexport const KERN_VERSION = 40;\n',
      version: 40,
    });
  });

  it('bricht ab, wenn die Zeile ihre Form verloren hat', () => {
    expect(() => erhoeheKernVersion('export const KERN_VERSION: number = 39;\n')).toThrow(/KERN_VERSION/);
  });
});
