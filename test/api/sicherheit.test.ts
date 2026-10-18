/**
 * Die Sicherheitstests, je Befund einer —
 * das ist die Zeile, die einen geschlossenen Befund geschlossen haelt. Alles hier
 * laeuft ueber `fastify.inject`, ohne einen Socket zu oeffnen: der Server bindet nie
 * an einen echten Port, und `sicherheit.ts` ist trotzdem vollstaendig geprueft.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testDatenbank } from '../../db/verbindung.ts';
import { baueServer } from '../../server/server.ts';
import { PROJEKTWURZEL } from '../../shared/konfiguration.ts';
import { LESENDE_TOOLS } from '../../ingest/mcp.ts';
import * as repository from '../../db/repository/index.ts';
import { istUnveraenderlich, UNVERAENDERLICH } from '../../server/sicherheit.ts';
import { aufraeumen, eigeneHerkunft, eigeneNavigation, konfiguration, PORT, testServer, URSPRUNG } from './hilfen.ts';

afterEach(() => {
  aufraeumen();
  vi.restoreAllMocks();
  vi.doUnmock('../../ingest/lauf.ts');
});

// --- Origin / Host / DNS-Rebinding -----------------------------------------

describe('Origin- und Host-Pruefung [§9]', () => {
  it('lehnt GET /api/kennzahlen mit fremdem Origin ab', async () => {
    const { app } = await testServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/kennzahlen',
      headers: eigeneHerkunft({ origin: 'https://boese.tld' }),
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).fehler.code).toBe('E_HERKUNFT');
  });

  it('lehnt Origin: "null" ab wie jede andere fremde Herkunft', async () => {
    const { app } = await testServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/kennzahlen',
      headers: eigeneHerkunft({ origin: 'null' }),
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).fehler.code).toBe('E_HERKUNFT');
  });

  it('lehnt eine API-Anfrage ganz ohne Origin und ohne Sec-Fetch-Site ab', async () => {
    // Das ist der curl-Fall: kein Browser dahinter, also auch kein Sec-Fetch-Site,
    // das gefaelscht werden koennte.
    const { app } = await testServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/kennzahlen',
      headers: { host: `127.0.0.1:${String(PORT)}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).fehler.code).toBe('E_HERKUNFT');
  });

  it('laesst eine API-Anfrage ohne Origin durch, wenn Sec-Fetch-Site same-origin bescheinigt', async () => {
    const { app } = await testServer();
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: eigeneNavigation() });
    expect(res.statusCode).toBe(200);
  });

  it('lehnt Sec-Fetch-Site: cross-site ab', async () => {
    const { app } = await testServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/kennzahlen',
      headers: eigeneNavigation({ 'sec-fetch-site': 'cross-site' }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('lehnt einen fremden Host ab — der DNS-Rebinding-Fall', async () => {
    const { app } = await testServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/kennzahlen',
      headers: { host: 'boese.tld', origin: URSPRUNG },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).fehler.code).toBe('E_HOST');
  });

  it('lehnt einen Host mit falschem Port ab', async () => {
    const { app } = await testServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/kennzahlen',
      headers: { host: '127.0.0.1:9999', origin: URSPRUNG },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).fehler.code).toBe('E_HOST');
  });

  it('akzeptiert localhost als Host, wortgleich mit der Allowlist', async () => {
    const { app } = await testServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: `localhost:${String(PORT)}`, origin: URSPRUNG },
    });
    expect(res.statusCode).toBe(200);
  });

  it('laesst unter localhost auch den passenden Origin zu, aber keinen mit fremdem Port', async () => {
    const { app } = await testServer();
    const anfrage = (origin: string) =>
      app.inject({
        method: 'GET',
        url: '/api/health',
        headers: { host: `localhost:${String(PORT)}`, origin },
      });
    expect((await anfrage(`http://localhost:${String(PORT)}`)).statusCode).toBe(200);
    expect((await anfrage('http://localhost:9999')).statusCode).toBe(403);
  });

  it('lehnt die Host-Pruefung auch fuer die ausgelieferte Seite selbst nicht ab', async () => {
    // Bei einer Navigation zur Seite sendet der Browser gar keinen Origin —
    // die Host-Pruefung allein muss hier genuegen.
    const { app } = await testServer();
    const res = await app.inject({ method: 'GET', url: '/', headers: { host: `127.0.0.1:${String(PORT)}` } });
    expect(res.statusCode).toBe(200);
  });

  it('prueft Host und Origin auch fuer eine unbekannte Route', async () => {
    const { app } = await testServer();
    const res = await app.inject({ method: 'GET', url: '/api/nichts', headers: { host: 'boese.tld' } });
    expect(res.statusCode).toBe(403);
  });

  it('erkennt eine API-Route auch prozent-kodiert, statt nur am rohen Pfad', async () => {
    // `/%61pi/refresh` sieht als roher String nicht wie `/api/*` aus — Fastify loest es
    // trotzdem auf `/api/refresh` auf. Die Herkunftspruefung muss dieselbe wie fuer den
    // unkodierten Pfad greifen, nicht die laxere Regel fuer Nicht-API-Routen.
    const { app, token } = await testServer();
    const res = await app.inject({
      method: 'POST',
      url: '/%61pi/refresh',
      headers: { host: `127.0.0.1:${String(PORT)}`, 'x-portfolio-token': token },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).fehler.code).toBe('E_HERKUNFT');
  });
});

// --- Session-Token in der ausgelieferten Seite ------------------------------

describe('Session-Token in der ausgelieferten Seite', () => {
  it('ersetzt den Platzhalter der echten index.html, statt ein zweites <meta> anzuhaengen', async () => {
    // `testServer()` zeigt auf einen nicht existierenden `distPfad` — dort greift immer
    // die Ausweichseite ohne Platzhalter. Dieser Test baut die echte Vorlage nach, sonst
    // pruefte keiner der Tests je den Weg, der beim echten `npm start` tatsaechlich laeuft.
    const db = await testDatenbank();
    const k = konfiguration();
    const distPfad = mkdtempSync(join(tmpdir(), 'portfolio-dist-test-'));
    writeFileSync(join(distPfad, 'index.html'), readFileSync(join(PROJEKTWURZEL, 'index.html'), 'utf8'));

    try {
      const { app, token } = baueServer({ db, konfiguration: k, distPfad });
      const res = await app.inject({ method: 'GET', url: '/', headers: { host: `127.0.0.1:${String(PORT)}` } });

      expect(res.statusCode).toBe(200);
      expect([...res.body.matchAll(/<meta name="portfolio-token"/g)]).toHaveLength(1);
      expect(res.body).toContain(`content="${token}"`);
      expect(res.body).not.toContain('__PORTFOLIO_TOKEN__');
    } finally {
      rmSync(distPfad, { recursive: true, force: true });
    }
  });
});

describe('Seite ohne Bau', () => {
  it('zeigt waehrend des ersten Laufs dessen Schritt statt "wird gebaut"', async () => {
    const db = await testDatenbank();
    const { app } = baueServer({ db, konfiguration: konfiguration(), distPfad: join(tmpdir(), 'portfolio-kein-dist') });
    const holen = async (): Promise<string> =>
      (await app.inject({ method: 'GET', url: '/', headers: { host: `127.0.0.1:${String(PORT)}` } })).body;

    expect(await holen()).toContain('Scapio wird gebaut');

    const id = repository.lauf.starte(db, '2026-01-01T00:00:00.000Z');
    repository.lauf.setzeSchritt(db, id, 'kurse');
    const waehrendLauf = await holen();
    expect(waehrendLauf).toContain('Anmeldung abgeschlossen');
    expect(waehrendLauf).toContain('Kurse abrufen');
    expect(waehrendLauf).not.toContain('Scapio wird gebaut');
  });
});

// --- Refresh-Token und Rumpf ------------------------------------------------

describe('POST /api/refresh: Token und Rumpf [§9, INV-08]', () => {
  it('lehnt Refresh ohne Token ab', async () => {
    const { app } = await testServer();
    const res = await app.inject({ method: 'POST', url: '/api/refresh', headers: eigeneHerkunft() });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).fehler.code).toBe('E_TOKEN');
  });

  it('lehnt Refresh mit falschem Token ab', async () => {
    const { app } = await testServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/refresh',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': 'falsch' },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).fehler.code).toBe('E_TOKEN');
  });

  it('lehnt einen Token falscher Laenge ab, ohne zu werfen', async () => {
    const { app, token } = await testServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/refresh',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': token.slice(0, -1) },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lehnt einen Rumpf ab, auch mit gueltigem Token', async () => {
    const { app, token } = await testServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/refresh',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': token, 'content-type': 'application/json' },
      payload: '{"quelle":"holdings"}',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).fehler.code).toBe('E_RUMPF');
  });

  it('lehnt einen Parameter in der Adresse ab, auch mit gueltigem Token', async () => {
    const { app, token } = await testServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/refresh?quelle=holdings',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': token },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).fehler.code).toBe('E_RUMPF');
  });
});

// --- Zweiter Refresh waehrend des ersten -----------------------------------

describe('POST /api/refresh: Sperre gegen doppelten Lauf [§9, INV-08]', () => {
  it('gibt beim zweiten Refresh 409, und es startet nur EIN Kindprozess', async () => {
    let aufrufe = 0;
    let freigeben: (wert?: void | PromiseLike<void>) => void = () => {};
    const wartet = new Promise<void>((r) => {
      freigeben = r;
    });

    vi.doMock('../../ingest/lauf.ts', () => ({
      fuehreLaufAus: async (optionen: { db: DatabaseSync }) => {
        aufrufe += 1;
        // Ein echter Lauf traegt sich sofort selbst in die Tabelle ein — das ist es,
        // worauf `warteAufLaufId` in der Route wartet. Ohne diese Zeile wuerde die
        // Route die vollen zwei Sekunden ausreizen, bevor sie 202 sendet.
        repository.lauf.starte(optionen.db, new Date().toISOString());
        await wartet;
        return { laufId: 1, status: 'erfolg', quellen: {}, hinweise: [], fehlerCode: null, neuBerechneteTage: 0 };
      },
    }));

    const db = await testDatenbank();
    const k = konfiguration();
    const { app, token } = baueServer({ db, konfiguration: k, distPfad: join(tmpdir(), 'portfolio-kein-dist') });

    const erster = await app.inject({
      method: 'POST',
      url: '/api/refresh',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': token },
    });
    expect(erster.statusCode).toBe(202);

    const zweiter = await app.inject({
      method: 'POST',
      url: '/api/refresh',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': token },
    });
    expect(zweiter.statusCode).toBe(409);
    expect(JSON.parse(zweiter.body).fehler.code).toBe('E_SPERRE');

    expect(aufrufe).toBe(1);
    freigeben();
  });
});

// --- INV-01 als Systemtest: alle MCP-Toolnamen im Repo sind lesend ----------

describe('MCP-Toolnamen sind eine Teilmenge der lesenden [INV-01]', () => {
  it('kein im Quelltext vorkommender Toolname faellt aus der Allowlist', async () => {
    const { execSync } = await import('node:child_process');
    const treffer = execSync(
      String.raw`grep -rhoE "'(get|list)_[a-z_]+'" ingest server core start db --include="*.ts" || true`,
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    const gefunden = new Set(
      treffer
        .split('\n')
        .filter((z) => z.length > 0)
        .map((z) => z.slice(1, -1)),
    );
    expect(gefunden.size).toBeGreaterThan(0);
    for (const name of gefunden) {
      expect(LESENDE_TOOLS as readonly string[]).toContain(name);
    }
  });
});

// --- Antwort-Header ----------------------------------------------------------

describe('Antwort-Header [§9]', () => {
  it('setzt CSP, nosniff, CORP, COOP, Referrer-Policy und Permissions-Policy', async () => {
    const { app } = await testServer();
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: eigeneHerkunft() });
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("object-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['permissions-policy']).toContain('geolocation=()');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('setzt diese Kopfzeilen auch auf einer 403-Antwort', async () => {
    const { app } = await testServer();
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host: 'boese.tld' } });
    expect(res.statusCode).toBe(403);
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('setzt keinerlei CORS-Header — auf keiner Antwort', async () => {
    const { app } = await testServer();
    for (const url of ['/api/health', '/api/nichts']) {
      const res = await app.inject({ method: 'GET', url, headers: eigeneHerkunft() });
      for (const kopf of Object.keys(res.headers)) {
        expect(kopf.toLowerCase()).not.toContain('access-control');
      }
    }
  });
});

// --- Methoden und Fehlerform --------------------------------------------------

describe('Methoden [INV-08]', () => {
  it('kennt weder PUT noch PATCH noch DELETE', async () => {
    const { app } = await testServer();
    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({ method, url: '/api/refresh', headers: eigeneHerkunft() });
      expect(res.statusCode).toBe(405);
      expect(JSON.parse(res.body).fehler.code).toBe('E_METHODE');
    }
  });
});

describe('Fehlerform [§9, server/CLAUDE.md]', () => {
  it('eine unbekannte Route antwortet einheitlich, ohne Details', async () => {
    const { app } = await testServer();
    const res = await app.inject({ method: 'GET', url: '/api/voellig-unbekannt', headers: eigeneHerkunft() });
    expect(res.statusCode).toBe(404);
    const koerper = JSON.parse(res.body) as { fehler: { code: string; text: string; hinweis: string } };
    expect(koerper.fehler.code).toBe('E_NICHT_GEFUNDEN');
    expect(res.body).not.toMatch(/ at |SELECT|\.ts:\d+/i);
  });

  it('ein interner Fehler zeigt weder Stacktrace noch SQL noch Dateipfad', async () => {
    const db = await testDatenbank();
    const k = konfiguration();
    const { app } = baueServer({ db, konfiguration: k, distPfad: join(tmpdir(), 'portfolio-kein-dist') });
    db.close(); // erzwingt einen echten, unerwarteten Fehler in der Route
    const res = await app.inject({ method: 'GET', url: '/api/kennzahlen', headers: eigeneHerkunft() });
    expect(res.statusCode).toBe(500);
    const koerper = JSON.parse(res.body) as { fehler: { code: string } };
    expect(koerper.fehler.code).toBe('E_INTERN');
    expect(res.body).not.toMatch(/ at |SELECT|\/Users\//i);
  });

  it('ein unbekannter Query-Parameter wird abgelehnt, ohne seinen Namen zu wiederholen', async () => {
    const { app } = await testServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/kennzahlen?geheimerParameterXYZ=1',
      headers: eigeneHerkunft(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('geheimerParameterXYZ');
  });
});

// --- dist/ ohne externe Adresse ------------------------------------------------

describe('gebaute Oberflaeche [INV-11]', () => {
  it('index.html enthaelt keine externe Adresse, sofern dist/ gebaut ist', () => {
    const pfad = join(process.cwd(), 'dist', 'index.html');
    let html: string;
    try {
      html = readFileSync(pfad, 'utf8');
    } catch {
      return; // dist/ ist in diesem Testlauf nicht gebaut — INV-11 hat einen eigenen Test dafuer
    }
    // data:-URIs koennen selbst "http://" enthalten (z. B. das SVG-Namensraum-Attribut
    // eines Inline-Favicons, das intern mit einfachen Anfuehrungszeichen quotet) — das
    // ist kein Netzwerkziel, deshalb bis zum schliessenden doppelten Anfuehrungszeichen
    // des Attributs aus dem Scan entfernen.
    const ohneDatenUris = html.replace(/data:[^"]*/g, '');
    expect(ohneDatenUris).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)/);
  });
});

// --- Cache-Control -------------------------------------------------------------

describe('Cache-Control [P-09]', () => {
  it('erkennt genau die inhaltsadressierten Dateien als unveraenderlich', () => {
    for (const url of [
      '/assets/index-C2Di4l-z.js',
      '/assets/index-DwPNw_uh.css',
      '/assets/geist-latin-wght-normal-BgDaEnEv.woff2',
      '/assets/index-C2Di4l-z.js?v=1',
    ]) {
      expect(istUnveraenderlich(url)).toBe(true);
    }
    for (const url of [
      '/',
      '/index.html',
      '/api/health',
      '/assets/logo.svg', // kein Hash im Namen: muss austauschbar bleiben
      '/assets/unterordner/index-C2Di4l-z.js', // nur die eine Ebene, kein Pfad daneben
      '/assets/index-kurz.js',
      '/anderswo/index-C2Di4l-z.js',
    ]) {
      expect(istUnveraenderlich(url)).toBe(false);
    }
  });

  it('liefert eine inhaltsadressierte Datei mit immutable aus — @fastify/static ueberschreibt das nicht', async () => {
    const { app } = await serverMitDist();
    const res = await app.inject({
      method: 'GET',
      url: '/assets/index-abcdefgh.js',
      headers: eigeneNavigation(),
    });
    expect(res.statusCode).toBe(200);
    // Ohne `cacheControl: false` an @fastify/static staende hier `public, max-age=0`:
    // das Plugin setzt die Kopfzeile beim Ausliefern selbst und gewinnt gegen den Hook.
    expect(res.headers['cache-control']).toBe(UNVERAENDERLICH);
  });

  it('gibt einem 404 auf einer Asset-Adresse kein immutable — sonst haelt der Browser den Fehler ein Jahr', async () => {
    const { app } = await serverMitDist();
    const res = await app.inject({ method: 'GET', url: '/assets/fehlt-abcdefgh.css', headers: eigeneNavigation() });
    expect(res.statusCode).toBe(404);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('laesst eine Datei ohne Hash im Namen bei no-store', async () => {
    const { app } = await serverMitDist();
    const res = await app.inject({ method: 'GET', url: '/assets/logo.svg', headers: eigeneNavigation() });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('laesst die Seite selbst bei no-store — der Sitzungsschluessel steckt darin', async () => {
    const { app } = await serverMitDist();
    const res = await app.inject({ method: 'GET', url: '/', headers: eigeneNavigation() });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('portfolio-token');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('gibt einer POST-Antwort nie immutable, auch nicht auf einer Asset-Adresse', async () => {
    const { app, token } = await serverMitDist();
    const res = await app.inject({
      method: 'POST',
      url: '/assets/index-abcdefgh.js',
      headers: eigeneHerkunft({ 'x-portfolio-token': token }),
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('Statische Auslieferung', () => {
  it.each(['/.geheim', '/assets/.geheim', '/assets/../.geheim', '/assets/%2e%2e/.geheim'])(
    'liefert die Punktdatei %s nicht aus',
    async (url) => {
      const { app } = await serverMitDist();
      const res = await app.inject({ method: 'GET', url, headers: eigeneNavigation() });
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toBe('geheim');
    },
  );

  it.each(['/../x', '/%2e%2e/etc/passwd', '/..%5cx', '/assets/..%5cx', '/assets//index-abcdefgh.js'])(
    'beantwortet den Traversal-Versuch %s mit 404, nicht mit 500',
    async (url) => {
      const { app } = await serverMitDist();
      const res = await app.inject({ method: 'GET', url, headers: eigeneNavigation() });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).fehler.code).toBe('E_NICHT_GEFUNDEN');
    },
  );

  it('liefert Assets aus, die erst nach dem Serverstart gebaut werden (npm run dev)', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'portfolio-dist-test-'));
    dists.push(dist);
    const db = await testDatenbank();
    const { app } = baueServer({ db, konfiguration: konfiguration(), distPfad: dist, protokoll: false });
    await app.ready();
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'assets', 'index-spaeter1.js'), 'console.log(1);\n');
    const res = await app.inject({ method: 'GET', url: '/assets/index-spaeter1.js', headers: eigeneNavigation() });
    expect(res.statusCode).toBe(200);
  });

  it('liefert die Seite nicht an der Seiten-Route vorbei aus, auch nicht in anderer Schreibweise', async () => {
    const { app } = await serverMitDist();
    const res = await app.inject({ method: 'GET', url: '/INDEX.HTML', headers: eigeneNavigation() });
    expect(res.statusCode).toBe(404);
  });
});

/** Ein Server mit einem echten, winzigen `dist/` — nur fuer die Cache-Kopfzeilen. */
async function serverMitDist(): Promise<{ app: FastifyInstance; token: string }> {
  const dist = mkdtempSync(join(tmpdir(), 'portfolio-dist-test-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head></head><body>x</body></html>');
  writeFileSync(join(dist, 'assets', 'index-abcdefgh.js'), 'console.log(1);\n');
  writeFileSync(join(dist, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  writeFileSync(join(dist, '.geheim'), 'geheim');
  writeFileSync(join(dist, 'assets', '.geheim'), 'geheim');
  dists.push(dist);

  const db = await testDatenbank();
  const { app, token } = baueServer({ db, konfiguration: konfiguration(), distPfad: dist, protokoll: false });
  await app.ready();
  return { app, token };
}

const dists: string[] = [];
afterEach(() => {
  for (const d of dists.splice(0)) rmSync(d, { recursive: true, force: true });
});
