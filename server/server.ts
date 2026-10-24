/**
 * Fastify auf 127.0.0.1. Ein Prozess liefert API und gebaute Oberflaeche aus.
 *
 * Die Bindung steht hier als Konstante und ist NICHT konfigurierbar — weder ueber
 * `config.json` noch ueber eine Umgebungsvariable. Ein Dashboard, das die eigenen
 * Depotzahlen zeigt, darf nicht durch das Setzen einer Variablen ins Netz geraten.
 * [INV-07]
 *
 * Dass API und Oberflaeche aus DEMSELBEN Ursprung kommen, ist kein Zufall: nur so
 * greifen `connect-src 'self'`, die Origin-Pruefung und `Cross-Origin-Resource-Policy`.
 * Ein getrennter Entwicklungsserver mit Proxy haette eine Ausnahme in genau diesen
 * Regeln verlangt — deshalb baut `start/dev.ts` statt dessen im Watch-Modus.
 *
 * Der Sitzungsschluessel entsteht beim Start, lebt nur im Speicher und wird in die
 * ausgelieferte `index.html` gelegt. Er steht in keinem Log und in keiner Datei.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Tag } from '../core/kalender.ts';
import type { Konfiguration } from '../shared/konfiguration.ts';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';
import { HAKEN, statusseite } from '../shared/statusseite.ts';
import * as repository from '../db/repository/index.ts';
import type { Lauf, LaufSchritt } from '../db/repository/lauf.ts';
import { NEULADE_SKRIPT_TAG, registriereEntwicklungReload } from './entwicklungReload.ts';
import { registriereFehlerbehandlung } from './fehler.ts';
import { CSP, neuerToken, registriereSicherheit } from './sicherheit.ts';
import { Sperre } from './sperre.ts';
import { registriereAufteilung } from './routen/aufteilung.ts';
import { registriereFluesse } from './routen/fluesse.ts';
import { registriereHealth } from './routen/health.ts';
import { registriereKennzahlen } from './routen/kennzahlen.ts';
import { registriereLauf } from './routen/lauf.ts';
import { registriereMcpAnmeldung } from './routen/mcpAnmeldung.ts';
import { registriereRebalancing } from './routen/rebalancing.ts';
import { registriereRefresh } from './routen/refresh.ts';
import { registriereSparplaene } from './routen/sparplaene.ts';
import { registriereTop25 } from './routen/top25.ts';
import { registriereZeitreihe } from './routen/zeitreihe.ts';
import { LESENDE_ROUTEN, MUTIERENDE_ROUTEN } from '../shared/routen.ts';

/** Nicht konfigurierbar. [INV-07] */
export const HOST = '127.0.0.1';

export type Kontext = {
  readonly db: DatabaseSync;
  readonly konfiguration: Konfiguration;
  readonly sperre: Sperre;
  readonly version: string;
  /** Eingefrorener Kalendertag statt Systemuhr — siehe `ServerOptionen.heute`. */
  readonly heute?: Tag;
};

export type ServerOptionen = {
  readonly db: DatabaseSync;
  readonly konfiguration: Konfiguration;
  /** Verzeichnis der gebauten Oberflaeche. Fehlt es, kommt eine Hinweisseite. */
  readonly distPfad?: string;
  readonly protokoll?: boolean;
  /** Haengt "(Demo)" an den Seitentitel — Unterscheidung von `npm start` auf einen Blick. */
  readonly demoModus?: boolean;
  /**
   * Friert den Kalendertag ein, aus dem die Zeitfenster berechnet werden. Nur fuer
   * Starter mit synthetischem Depot, deren Kurshistorie an einem festen Tag endet
   * (`start/demo.ts`, `test/e2e/server-start.ts`) — der echte Start laesst das Feld
   * weg und `baueLesemodell` liest die Uhr.
   */
  readonly heute?: Tag;
  /**
   * Nur `start/dev.ts` und `start/demo.ts` setzen das: haengt das Neulade-Skript in die
   * ausgelieferte Seite und oeffnet den Kanal dafuer. `npm start` uebergibt es nie.
   */
  readonly neuladen?: boolean;
};

export type LaufenderServer = {
  readonly app: FastifyInstance;
  readonly adresse: string;
  readonly sperre: Sperre;
  readonly schliesse: () => Promise<void>;
};

function projektVersion(): string {
  try {
    const roh = JSON.parse(readFileSync(join(PROJEKTWURZEL, 'package.json'), 'utf8')) as { version?: unknown };
    return typeof roh.version === 'string' ? roh.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Nur diese Seite braucht gelockerte Direktiven — Inline-`<style>` (`style-src`), die
 * Schrift als `data:`-URL (`font-src`) und das Nachfrage-Skript (`script-src`). Fuer das
 * Skript kein pauschales `'unsafe-inline'`: ein frischer Nonce pro Antwort, den nur
 * dieses eine `<script>`-Tag traegt. Die echte, gebaute Oberflaeche bekommt weiterhin
 * das strenge `CSP` aus `sicherheit.ts` unveraendert.
 */
export function hinweisseiteCsp(nonce: string): string {
  return CSP.replace("script-src 'self'", `script-src 'nonce-${nonce}'`)
    // Ganze Direktive ersetzen, nicht nur "'self'": ein `sha256-…` aus der
    // strengen CSP (fuer sonner, siehe sicherheit.ts) neben 'unsafe-inline'
    // liesse den Browser 'unsafe-inline' ignorieren [CSP3] — dann faellt das
    // gesamte Inline-<style> dieser Seite weg, nicht nur der Spinner.
    .replace(/style-src [^;]+/, "style-src 'unsafe-inline'")
    .replace("font-src 'self'", 'font-src data:');
}

/** Dieselben Worte wie im Aktualisieren-Knopf (`src/i18n/de.ts`). */
const SCHRITTE = {
  depot: 'Depot abrufen',
  kurse: 'Kurse abrufen',
  fonds: 'Wertpapiere einordnen',
  inflation: 'Inflation abrufen',
} satisfies Record<LaufSchritt, string>;

// Ohne eigene Rolle: die Seite ist als Ganzes `role="status"`, siehe `shared/statusseite.ts`.
const SPINNER =
  '<svg class="spinner" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>';

const SPINNER_STIL = `  .spinner { animation: drehen 1s linear infinite; }
  @keyframes drehen { to { transform: rotate(360deg); } }`;

/**
 * Fragt alle drei Sekunden `/` ab, statt sich neu zu laden: ein Neuladen setzte Zoom,
 * Leseposition und Screenreader jedes Mal an den Anfang. Neu geladen wird erst, wenn `/`
 * etwas anderes liefert — die gebaute Oberflaeche oder einen anderen Zustand dieser Seite.
 * Ein neuer Schritt desselben Laufs ersetzt nur den Inhalt der Live-Region.
 * `nonce` erlaubt genau dieses eine Skript, siehe `hinweisseiteCsp`.
 */
function nachfrageSkript(nonce: string): string {
  return `<script nonce="${nonce}">
const nachfragen = async () => {
  try {
    const antwort = await fetch('/', { cache: 'no-store' });
    if (antwort.ok) {
      const neu = new DOMParser().parseFromString(await antwort.text(), 'text/html').getElementById('statusseite');
      const hier = document.getElementById('statusseite');
      if (neu === null || neu.querySelector('h1')?.textContent !== hier.querySelector('h1')?.textContent) {
        window.location.reload();
        return;
      }
      if (neu.innerHTML !== hier.innerHTML) hier.replaceChildren(...Array.from(neu.childNodes, (k) => document.importNode(k, true)));
    }
  } catch {}
  setTimeout(nachfragen, 3000);
};
setTimeout(nachfragen, 3000);
</script>`;
}

/**
 * Laeuft beim Aufruf der erste Lauf, sagt die Seite das statt "wird gebaut": er dauert laenger
 * als der Bau, und das Terminal liegt hinter dem Browser [ADR-039].
 */
export function hinweisseite(nonce: string, lauf: Pick<Lauf, 'status' | 'schritt'> | null = null): string {
  const fuss = nachfrageSkript(nonce);
  if (lauf?.status === 'laufend') {
    const schritt = lauf.schritt === null ? '' : `<br />${SCHRITTE[lauf.schritt]} …`;
    return statusseite({
      titel: 'Scapio: Scalable Capital Depot',
      ton: 'gewinn',
      symbol: HAKEN,
      ueberschrift: 'Anmeldung abgeschlossen',
      text: `Die Daten werden von Scalable Capital abgerufen.${schritt}`,
      fortschritt: 'Daten werden abgerufen',
      nachsatz: 'Scapio erscheint hier gleich von selbst.',
      fuss,
    });
  }
  return statusseite({
    titel: 'Scapio: Scalable Capital Depot',
    ton: 'akzent',
    symbol: SPINNER,
    stil: SPINNER_STIL,
    ueberschrift: 'Scapio wird gebaut...',
    text: 'Scapio erscheint hier von selbst, sobald der Bau fertig ist.<br />Hilft das nicht, starte Scapio neu.',
    fuss,
  });
}

const PLATZHALTER_ATTRIBUT = 'content="__PORTFOLIO_TOKEN__"';

/**
 * Legt den Sitzungsschluessel als `<meta>` in den Kopf der Seite. Nur so kommt er in
 * den Browser, ohne je auf der Platte zu stehen. Er ist hexadezimal und kann daher
 * kein Attribut und kein Tag beenden.
 *
 * Die gebaute `index.html` traegt bereits den Platzhalter aus der Quelldatei — dessen
 * Inhalt wird ersetzt, statt ein zweites `<meta>` anzuhaengen. Sonst faende
 * `document.querySelector` im Browser das unersetzte erste Tag und hielte die Seite
 * faelschlich fuer nicht vom Server ausgeliefert. Nur die Ausweichseite ohne Bau
 * (`hinweisseite()`) hat keinen Platzhalter; dort wird das `<meta>` neu eingefuegt.
 */
function mitToken(html: string, token: string): string {
  if (html.includes(PLATZHALTER_ATTRIBUT)) return html.replace(PLATZHALTER_ATTRIBUT, `content="${token}"`);
  const meta = `<meta name="portfolio-token" content="${token}">`;
  if (html.includes('</head>')) return html.replace('</head>', `${meta}</head>`);
  return meta + html;
}

/**
 * Nur im Demo-Modus: haengt "(Demo)" an den Browser-Tab und legt ein `<meta>` ab, an
 * dem die Oberflaeche selbst erkennt, dass sie das synthetische Depot zeigt (siehe
 * `src/lib/demoModus.ts`) — und denselben Zusatz an ihre eigene Überschrift haengt.
 */
function mitDemoKennzeichen(html: string): string {
  const mitTitel = html.replace('</title>', ' (Demo)</title>');
  const meta = '<meta name="demo-modus" content="true">';
  return mitTitel.includes('</head>') ? mitTitel.replace('</head>', `${meta}</head>`) : meta + mitTitel;
}

/** Nur in `neuladen`-Betrieb: haengt das Neulade-Skript an, gleichursprung, ohne CSP-Ausnahme. */
function mitNeuladeSkript(html: string): string {
  return html.includes('</body>')
    ? html.replace('</body>', `${NEULADE_SKRIPT_TAG}</body>`)
    : html + NEULADE_SKRIPT_TAG;
}

export function baueServer(optionen: ServerOptionen): { app: FastifyInstance; token: string; sperre: Sperre } {
  const { db, konfiguration, demoModus, neuladen } = optionen;
  const distPfad = optionen.distPfad ?? join(PROJEKTWURZEL, 'dist');
  const token = neuerToken();
  const sperre = new Sperre(konfiguration.datenpfad);

  const app = Fastify({
    logger: optionen.protokoll === false ? false : { level: 'warn' },
    // Kein Vertrauen in Weiterleitungs-Koepfe: es gibt keinen Proxy davor.
    trustProxy: false,
    bodyLimit: 1024,
  });

  // Diese API nimmt keinerlei Eingabe entgegen. Ein Parser, der nichts parst, kann
  // auch nichts falsch parsen — und `POST /api/refresh` mit leerem Rumpf und
  // beliebigem Content-Type laeuft nicht in einen Fastify-eigenen Fehler. [INV-08]
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_anfrage, _rumpf, fertig) => {
    fertig(null, null);
  });

  // Laufzeitwache fuer INV-08: nicht nur der Test zaehlt Routen nach, der Server
  // verweigert sich selbst, wenn irgendwo eine dritte mutierende Route entstehen
  // wuerde — auch wenn ein spaeteres Plugin sie unter einem Pfad registriert, den kein
  // Quelltext-Grep mehr findet.
  const ERLAUBTE_MUTATION = new Set(Object.values(MUTIERENDE_ROUTEN).map((pfad) => `POST ${pfad}`));
  const lesend = new Set<string>();
  app.addHook('onRoute', (route) => {
    for (const methode of Array.isArray(route.method) ? route.method : [route.method]) {
      if (methode === 'GET') lesend.add(route.url);
      if (methode === 'GET' || methode === 'HEAD') continue;
      const kennung = `${methode} ${route.url}`;
      if (!ERLAUBTE_MUTATION.has(kennung)) {
        throw new Error(`INV-08: unbekannte mutierende Route ${kennung}`);
      }
    }
  });

  registriereSicherheit(app, { port: konfiguration.port, token });
  registriereFehlerbehandlung(app);

  const ctx: Kontext = { db, konfiguration, sperre, version: projektVersion(), heute: optionen.heute };

  registriereHealth(app, ctx);
  registriereZeitreihe(app, ctx);
  registriereKennzahlen(app, ctx);
  registriereAufteilung(app, ctx);
  registriereRebalancing(app, ctx);
  registriereTop25(app, ctx);
  registriereFluesse(app, ctx);
  registriereSparplaene(app, ctx);
  registriereLauf(app, ctx);
  registriereRefresh(app, ctx);
  registriereMcpAnmeldung(app, ctx);

  // Fehlt ein `registriere…`-Aufruf, antwortete die Route sonst still mit 404.
  const fehlend = Object.values(LESENDE_ROUTEN).filter((r) => !lesend.has(r.pfad));
  if (fehlend.length > 0) throw new Error(`Nicht registriert: ${fehlend.map((r) => r.pfad).join(', ')}`);

  if (neuladen === true) registriereEntwicklungReload(app, distPfad);

  const indexPfad = join(distPfad, 'index.html');

  const seite = (_anfrage: FastifyRequest, antwort: FastifyReply): FastifyReply => {
    const gebaut = existsSync(indexPfad);
    let html: string;
    if (gebaut) {
      html = readFileSync(indexPfad, 'utf8');
      if (neuladen === true) html = mitNeuladeSkript(html);
    } else {
      const nonce = neuerToken();
      html = hinweisseite(nonce, repository.lauf.letzter(db));
      antwort.header('Content-Security-Policy', hinweisseiteCsp(nonce));
    }
    const mitAllem = demoModus === true ? mitDemoKennzeichen(mitToken(html, token)) : mitToken(html, token);
    return antwort.type('text/html; charset=utf-8').send(mitAllem);
  };

  app.get('/', seite);
  app.get('/index.html', seite);

  // Immer registriert, auch ohne `dist/`: `npm start` und `npm run dev` starten den Server
  // vor dem Bau (ADR-039), und ohne Registrierung bliebe jedes Asset bis zum Neustart ein 404.
  // `index: false`, damit die Seite immer ueber den Weg oben geht: ohne das lieferte
  // @fastify/static die `index.html` direkt aus — also ohne Sitzungsschluessel. Die
  // explizite `/index.html`-Route oben gewinnt gegen den Wildcard darunter, weil
  // Fastify eine exakte Route immer vor einem Wildcard prueft.
  //
  // `wildcard: true` (statt `false`) ist Absicht: `false` wuerde die Dateien im
  // Wurzelverzeichnis EINMALIG beim Start einlesen und je Datei eine feste Route
  // anlegen. Im Entwicklungsbetrieb schreibt `vite build --watch` aber laufend neue,
  // inhaltsadressierte Dateinamen in dasselbe Verzeichnis, ohne dass der laufende
  // Serverprozess neu startet — die feste Routenliste liefe still auseinander und
  // frisch gebaute Dateien braechten ein 404, obwohl sie auf der Platte liegen.
  //
  // `cacheControl: false` gibt die Cache-Entscheidung an `sicherheit.ts` zurueck. Ohne
  // das setzt @fastify/static von sich aus `public, max-age=0` und ueberschreibt damit
  // sowohl das `no-store` aus den Kopfzeilen als auch das `immutable` fuer die
  // inhaltsadressierten Dateien — beides trifft `sicherheit.ts`, an einer Stelle. [P-09]
  //
  // Nur `assets/`, nicht das ganze `dist/`: sonst liefert ein Dateisystem ohne
  // Gross-/Kleinschreibung `/INDEX.HTML` an der Seiten-Route vorbei aus, also ohne
  // Sitzungsschluessel und ohne Hinweisseiten-CSP. `dotfiles: 'ignore'` macht aus einer
  // Punktdatei ein 404 statt einer Auslieferung.
  void app.register(fastifyStatic, {
    root: join(distPfad, 'assets'),
    prefix: '/assets/',
    dotfiles: 'ignore',
    index: false,
    wildcard: true,
    cacheControl: false,
    // Vor dem ersten Bau fehlt das Verzeichnis noch — kein Grund fuer eine Warnung.
    suppressWarning: true,
  });

  return { app, token, sperre };
}

export async function starteServer(optionen: ServerOptionen): Promise<LaufenderServer> {
  const { app, sperre } = baueServer(optionen);
  await app.listen({ host: HOST, port: optionen.konfiguration.port });

  return {
    app,
    sperre,
    adresse: `http://${HOST}:${optionen.konfiguration.port}`,
    schliesse: async () => {
      await app.close();
    },
  };
}
