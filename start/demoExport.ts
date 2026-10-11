/**
 * `npm run demo:export`: die Demo als statischer Abzug nach `.demo-export/` [ADR-048].
 *
 * Die Antworten kommen per `app.inject()` aus demselben Server wie `npm run demo`; es
 * lauscht nichts auf einem Port. Die Seite trägt den Token-Platzhalter statt eines
 * Schlüssels — die Oberfläche hält „Aktualisieren“ dann ohnehin gesperrt.
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { baueServer } from '../server/server.ts';
import { abzugAnfragen, abzugPfad } from '../shared/demoAbzug.ts';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';
import { baueDemo } from './demoServer.ts';

const ZIEL = join(PROJEKTWURZEL, '.demo-export');
const DIST = join(PROJEKTWURZEL, 'dist');

async function haupt(): Promise<void> {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error('dist/index.html fehlt — erst `npm run build`.');
  }
  const { db, konfiguration, heute } = await baueDemo();
  const { app, token, sperre } = baueServer({ db, konfiguration, demoModus: true, heute, protokoll: false });
  const kopf = { host: `127.0.0.1:${String(konfiguration.port)}`, 'sec-fetch-site': 'same-origin' };

  try {
    rmSync(ZIEL, { recursive: true, force: true });
    mkdirSync(ZIEL, { recursive: true });
    cpSync(join(DIST, 'assets'), join(ZIEL, 'assets'), { recursive: true });

    const seite = await app.inject({ method: 'GET', url: '/', headers: kopf });
    if (seite.statusCode !== 200) throw new Error(`GET / → ${String(seite.statusCode)}`);
    writeFileSync(join(ZIEL, 'index.html'), seite.body.replace(`content="${token}"`, 'content="__PORTFOLIO_TOKEN__"'));

    const anfragen = abzugAnfragen();
    for (const url of anfragen) {
      const adresse = new URL(url, 'http://abzug');
      const pfad = abzugPfad(adresse.pathname, adresse.searchParams);
      if (pfad === null) throw new Error(`${url} hat keinen Platz im Abzug.`);
      const antwort = await app.inject({ method: 'GET', url, headers: kopf });
      if (antwort.statusCode !== 200) throw new Error(`${url} → ${String(antwort.statusCode)}`);
      const datei = join(ZIEL, ...pfad.split('/'));
      mkdirSync(dirname(datei), { recursive: true });
      writeFileSync(datei, antwort.body);
    }
    process.stdout.write(`Abzug mit ${String(anfragen.length)} Antworten in ${ZIEL}\n`);
  } finally {
    await app.close();
    sperre.gibFrei();
    db.close();
  }
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) await haupt();
