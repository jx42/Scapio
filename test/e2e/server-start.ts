/**
 * Startet einen echten Server-Prozess fuer den Durchstich-Test: eigene In-Memory-
 * Datenbank, eigenes temporaeres `datenpfad`-Verzeichnis, mit dem Szenario aus
 * `daten.ts` vorbefuellt. Playwright startet und beendet diesen Prozess selbst
 * (siehe `playwright.config.ts`, `webServer`). Kein anderer Prozess teilt sich
 * diese Datenbank oder diesen Port.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tagAus } from '../../core/kalender.ts';
import { testDatenbank } from '../../db/verbindung.ts';
import { konfigurationFuer } from '../../shared/konfiguration.ts';
import { starteServer } from '../../server/server.ts';
import { E2E_PORT } from './config.ts';
import { seedeDatenbank } from './seed.ts';

async function haupt(): Promise<void> {
  const datenpfad = mkdtempSync(join(tmpdir(), 'portfolio-e2e-'));
  const konfiguration = konfigurationFuer(datenpfad, { port: E2E_PORT });

  const db = await testDatenbank();
  // Wie in `start/demoServer.ts`: der Server rechnet mit dem Tag, an dem das Szenario endet.
  const jetzt = new Date().toISOString();
  const e2e = seedeDatenbank(db, tagAus(jetzt), jetzt);

  const server = await starteServer({ db, konfiguration, heute: e2e.heute });
  console.log(`e2e-server bereit auf ${server.adresse}`);
}

haupt().catch((fehler: unknown) => {
  console.error(fehler);
  process.exit(1);
});
