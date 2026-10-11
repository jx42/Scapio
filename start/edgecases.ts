/**
 * `npm run edgecases` — eine Seite mit allen Fehlermeldungen und Randfaellen der Oberflaeche,
 * in Tabs: einzelne Meldungen direkt, einzelne Kacheln und ganze Seiten je in einem iframe.
 * Nur zum Ansehen von Texten und Zustaenden.
 *
 * Kein API-Server lauscht: die Basisantworten (Demo-Depot und leere Datenbank) holt dieses
 * Skript einmal per `inject` aus dem echten Server und reicht sie als JSON an die Seite.
 * Dort ersetzt jeder Rahmen `fetch` durch einen Stub (`test/edgecases/stub.ts`). So braucht
 * die Herkunftspruefung keine Ausnahme fuer den Vite-Port, und kein Klick erreicht je
 * einen Ingest.
 *
 * Die zwei Seiten ausserhalb von Vite (Bau-Hinweis, Anmeldung abgeschlossen) liefert dieses
 * Skript selbst aus; die Uebersicht zeigt sie in einem Rahmen ohne Skripte, damit der
 * Bau-Hinweis sich nicht alle drei Sekunden neu laedt.
 *
 * Vite im Middleware-Modus hinter einem eigenen `http`-Server, damit die Bindung wie ueberall
 * sichtbar an `HOST` haengt. [INV-07]
 */

import { mkdirSync } from 'node:fs';
import { createServer as httpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer as viteServer } from 'vite';
import { BENCHMARKS, RISIKOFREI_ISIN } from '../shared/benchmarks.ts';
import { oeffneImBrowser } from '../shared/browser.ts';
import { tagAus } from '../core/kalender.ts';
import type { Tag } from '../core/kalender.ts';
import { testDatenbank } from '../db/verbindung.ts';
import { vorgabeErlaubteHosts } from '../shared/hosts.ts';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';
import type { Konfiguration } from '../shared/konfiguration.ts';
import { anmeldungAbgeschlossenHtml } from '../ingest/mcpAnmeldung.ts';
import { HOST, baueServer, hinweisseite } from '../server/server.ts';
import { seedeDatenbank } from '../test/e2e/seed.ts';
import { FENSTER, ZEITRAEUME } from '../shared/zeitfenster.ts';

export const EDGECASES_PORT = 4793;
/** Nur Kennung im Host-Kopf der `inject`-Anfragen; gebunden wird dieser Port nie. */
const API_PORT = 4794;
const SEITE = '/test/edgecases/index.html';

const STATUSSEITEN: Record<string, () => string> = {
  '/__edgecases/bau.html': () => hinweisseite('edgecases'),
  '/__edgecases/bau-lauf.html': () => hinweisseite('edgecases', { status: 'laufend', schritt: 'kurse' }),
  '/__edgecases/anmeldung.html': () => anmeldungAbgeschlossenHtml(),
  '/__edgecases/anmeldung-weiter.html': () => anmeldungAbgeschlossenHtml(true),
};

function pfade(): string[] {
  const benchmarks: (string | null)[] = [null, ...BENCHMARKS.map((b) => b.isin), RISIKOFREI_ISIN];
  return [
    '/api/health',
    '/api/kennzahlen',
    '/api/aufteilung',
    '/api/top25',
    '/api/sparplaene',
    '/api/lauf',
    '/api/mcp-anmeldung',
    ...ZEITRAEUME.flatMap((z) =>
      benchmarks.map(
        (b) => `/api/zeitreihe?zeitraum=${encodeURIComponent(z)}` + (b === null ? '' : `&benchmark=${encodeURIComponent(b)}`),
      ),
    ),
    ...FENSTER.map((f) => `/api/fluesse?fenster=${encodeURIComponent(f)}`),
  ];
}

async function sammle(mitDepot: boolean, konfiguration: Konfiguration): Promise<Record<string, unknown>> {
  const db = await testDatenbank();
  const jetzt = new Date().toISOString();
  let heute: Tag = tagAus(jetzt);
  if (mitDepot) heute = seedeDatenbank(db, heute, jetzt).heute;

  const { app } = baueServer({ db, konfiguration, heute, protokoll: false });
  await app.ready();
  const basis: Record<string, unknown> = {};
  try {
    for (const pfad of pfade()) {
      const antwort = await app.inject({
        method: 'GET',
        url: pfad,
        headers: { host: `${HOST}:${String(API_PORT)}`, 'sec-fetch-site': 'same-origin' },
      });
      if (antwort.statusCode !== 200) throw new Error(`${pfad}: ${String(antwort.statusCode)} ${antwort.body}`);
      basis[pfad] = antwort.json();
    }
  } finally {
    await app.close();
    db.close();
  }
  return basis;
}

async function haupt(): Promise<void> {
  const datenpfad = join(tmpdir(), 'scapio-edgecases');
  mkdirSync(datenpfad, { recursive: true });
  const konfiguration: Konfiguration = {
    port: API_PORT,
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

  const basis = JSON.stringify({ demo: await sammle(true, konfiguration), leer: await sammle(false, konfiguration) });

  const http = httpServer();
  const vite = await viteServer({
    root: PROJEKTWURZEL,
    appType: 'mpa',
    server: { middlewareMode: true, hmr: { server: http } },
  });
  http.on('request', (anfrage, antwort) => {
    if (anfrage.url === '/') {
      antwort.writeHead(302, { Location: SEITE }).end();
      return;
    }
    if (anfrage.url === '/__edgecases/basis.json') {
      antwort.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(basis);
      return;
    }
    const url = anfrage.url ?? '';
    // Ohne hasOwn liefe `/constructor` oder `/toString` in Object.prototype.
    const statusseite = Object.hasOwn(STATUSSEITEN, url) ? STATUSSEITEN[url] : undefined;
    if (statusseite !== undefined) {
      antwort.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(statusseite());
      return;
    }
    vite.middlewares(anfrage, antwort);
  });

  http.on('error', (fehler: NodeJS.ErrnoException) => {
    if (fehler.code === 'EADDRINUSE') {
      process.stderr.write(`Port ${String(EDGECASES_PORT)} ist belegt — laeuft schon ein \`npm run edgecases\`?\n`);
      process.exit(1);
    }
    throw fehler;
  });
  http.listen({ host: HOST, port: EDGECASES_PORT }, () => {
    const adresse = `http://${HOST}:${String(EDGECASES_PORT)}${SEITE}`;
    process.stdout.write(`Randfaelle unter ${adresse} — Strg+C beendet.\n`);
    oeffneImBrowser(adresse);
  });

  const beenden = (): void => {
    void vite.close().then(() => {
      http.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', beenden);
  process.on('SIGTERM', beenden);
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) await haupt();
