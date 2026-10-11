/** Jede Quelle unter `ingest/quellen/` muss mit ihrem `raw_snapshot.quelle`-Namen in DATENMODELL stehen. */

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ordner = new URL('../../ingest/quellen/', import.meta.url);
const datenmodell = readFileSync(new URL('../../docs/DATENMODELL.md', import.meta.url), 'utf8');

const module = readdirSync(ordner).filter((d) => d.endsWith('.ts'));

describe('raw_snapshot.quelle', () => {
  it.each(module)('%s ist in docs/DATENMODELL.md beschrieben', async (datei) => {
    const m = (await import(new URL(datei, ordner).href)) as {
      QUELLE?: string;
      quelleFuer?: (isin: string) => string;
    };
    const name = m.QUELLE ?? m.quelleFuer?.('<isin>');
    expect(name, 'weder QUELLE noch quelleFuer exportiert').toBeDefined();
    expect(datenmodell).toContain(`\`${String(name)}\``);
  });

  it('nennt auch den Status-Namen der Fondskataloge', () => {
    expect(datenmodell).toContain('`fondskatalog:<anbieter>`');
  });
});
