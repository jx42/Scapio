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
import type { Konfiguration } from '../../shared/konfiguration.ts';
import { starteServer } from '../../server/server.ts';
import { E2E_PORT } from './config.ts';
import { seedeDatenbank } from './seed.ts';

async function haupt(): Promise<void> {
  const datenpfad = mkdtempSync(join(tmpdir(), 'portfolio-e2e-'));
  const konfiguration: Konfiguration = {
    port: E2E_PORT,
    datenverzeichnis: datenpfad,
    datenpfad,
    mcpZeitlimitMs: 120_000,
    csvZeitlimitMs: 30_000,
    csvGroesstMb: 32,
    erlaubteHosts: ['www.ishares.com', 'ec.europa.eu', 'data-api.ecb.europa.eu'],
    fondsKatalogFrischeTage: 5,
    inflationsquelle: 'eurostat',
    zinsquelle: 'ecb',
    driftSchwellen: { hinweis: 0.001, banner: 0.005, abbruch: 0.02 },
    top25: true,
  };

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
