/**
 * Der eigentliche Demo-Server, ausschliesslich unter `node --watch` als Kind von
 * `start/demo.ts` gestartet — dieselbe Trennung wie `start/dev.ts`/`start/start.ts`.
 * Aendert sich `server/`, `core/` oder `db/`, startet dieser Prozess neu; das Bauen der
 * Oberflaeche uebernimmt der Geschwisterprozess mit `vite build --watch`, siehe
 * `start/demo.ts`. Bis zum ersten Bau zeigt `server/server.ts` von selbst die
 * Hinweisseite mit eigenem Neulade-Timer — kein Warten hier noetig.
 *
 * Nutzt dieselbe In-Memory-DB und dasselbe Szenario wie der Playwright-Durchstich
 * (`test/e2e/`) — reine Wiederverwendung, kein zweiter Datengenerator zum Pflegen.
 * Eigener Port und eigenes Datenverzeichnis, damit ein gleichzeitig laufendes
 * `npm start` nicht kollidiert und kein Demo-Lesezeichen je echte Daten zeigen kann —
 * die In-Memory-DB haelt ohnehin nie ein echtes Depot.
 *
 * Das Datenverzeichnis liegt fest (nicht `mkdtemp`), damit ein Neustart durch
 * `node --watch` nicht bei jedem Speichern ein neues Verzeichnis anlegt.
 */

import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { tagAus, type Tag } from '../core/kalender.ts';
import { vorgabeErlaubteHosts } from '../shared/hosts.ts';
import type { Konfiguration } from '../shared/konfiguration.ts';
import { testDatenbank, type Datenbank } from '../db/verbindung.ts';
import { starteServer } from '../server/server.ts';
import { seedeDatenbank } from '../test/e2e/seed.ts';

export const DEMO_PORT = 4791;

/** Konfiguration, Datenbank und `heute` der Demo — auch für den Abzug (`start/demoExport.ts`). */
export async function baueDemo(): Promise<{ db: Datenbank; konfiguration: Konfiguration; heute: Tag }> {
  const datenpfad = join(tmpdir(), 'scapio-demo');
  mkdirSync(datenpfad, { recursive: true });
  const konfiguration: Konfiguration = {
    port: DEMO_PORT,
    datenverzeichnis: datenpfad,
    datenpfad,
    mcpZeitlimitMs: 120_000,
    csvZeitlimitMs: 30_000,
    csvGroesstMb: 32,
    erlaubteHosts: vorgabeErlaubteHosts(),
    fondsKatalogFrischeTage: 5,
    inflationsquelle: 'eurostat',
    zinsquelle: 'ecb',
    driftSchwellen: { hinweis: 0.001, banner: 0.005, abbruch: 0.02 },
    top25: true,
  };

  const db = await testDatenbank();
  // Das Szenario endet am letzten Tag der echten Kurshistorie, nicht heute. Der Server
  // bekommt genau diesen Tag als `heute` — sonst laegen "1W" und "1M" hinter dem
  // letzten Datenpunkt und die Verlaufskachel bliebe leer, obwohl Daten da sind.
  const jetzt = new Date().toISOString();
  const demo = seedeDatenbank(db, tagAus(jetzt), jetzt);
  return { db, konfiguration, heute: demo.heute };
}

async function haupt(): Promise<void> {
  const { db, konfiguration, heute } = await baueDemo();

  let server;
  try {
    server = await starteServer({ db, konfiguration, demoModus: true, heute, neuladen: true });
  } catch (fehler) {
    if ((fehler as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      process.stderr.write(`Port ${String(DEMO_PORT)} ist belegt — laeuft schon ein \`npm run demo\`?\n`);
      process.exitCode = 1;
      db.close();
      return;
    }
    throw fehler;
  }

  process.stdout.write(`Testdaten-Server laeuft auf ${server.adresse} — zeigt kein echtes Depot.\n`);

  const beenden = (): void => {
    void server.schliesse().then(() => {
      server.sperre.gibFrei();
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', beenden);
  process.on('SIGTERM', beenden);
}

// Nur ausfuehren, wenn diese Datei der Einstiegspunkt ist — nicht beim Importieren.
if (import.meta.filename === resolve(process.argv[1] ?? '')) await haupt();
