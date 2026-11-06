/** PR-Bilder nur aus der Demo [ADR-042]: Merkmal und Argumente, ohne Browser. */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { tagAus } from '../../core/kalender.ts';
import { konfigurationFuer } from '../../shared/konfiguration.ts';
import { testDatenbank } from '../../db/verbindung.ts';
import { baueServer } from '../../server/server.ts';
import { DEMO_PORT } from '../../start/demoServer.ts';
import { auftragLesen, istDemo } from '../../start/prBild.ts';

/** Wertet den Selektor gegen echtes HTML aus — genau so weit, wie `istDemo` ihn braucht. */
function seiteAus(html: string): Pick<Page, 'locator'> {
  return {
    locator: (selektor: string) => {
      const treffer = /^meta\[name="([^"]+)"\]\[content="([^"]+)"\]$/.exec(selektor);
      if (treffer === null) throw new Error(`unerwarteter Selektor: ${selektor}`);
      const tag = `<meta name="${treffer[1] ?? ''}" content="${treffer[2] ?? ''}">`;
      return { count: () => Promise.resolve(html.split(tag).length - 1) } as unknown as ReturnType<Page['locator']>;
    },
  };
}

async function startseite(demoModus: boolean): Promise<string> {
  const dist = mkdtempSync(join(tmpdir(), 'scapio-prbild-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<html><head><title>Scapio</title></head><body></body></html>');
  const db = await testDatenbank();
  const { app } = baueServer({
    db,
    konfiguration: konfigurationFuer(dist, { port: DEMO_PORT }),
    distPfad: dist,
    demoModus,
    heute: tagAus(new Date().toISOString()),
    protokoll: false,
  });
  const res = await app.inject({ method: 'GET', url: '/', headers: { host: `127.0.0.1:${String(DEMO_PORT)}` } });
  await app.close();
  db.close();
  rmSync(dist, { recursive: true, force: true });
  return res.body;
}

describe('prBild', () => {
  it('erkennt die Demo am Merkmal des Servers und eine echte Seite an seinem Fehlen', async () => {
    expect(await istDemo(seiteAus(await startseite(true)))).toBe(true);
    expect(await istDemo(seiteAus(await startseite(false)))).toBe(false);
  });

  it('nimmt nur Nummer und Kachel-ids an, die in einen Dateinamen passen', () => {
    expect(auftragLesen(['41', 'verlauf', 'aufteilung'])).toEqual({ nummer: '41', kacheln: ['verlauf', 'aufteilung'] });
    expect(auftragLesen(['41'])).toBeNull();
    expect(auftragLesen(['x', 'verlauf'])).toBeNull();
    expect(auftragLesen(['41', '../echt'])).toBeNull();
  });
});
