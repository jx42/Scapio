/**
 * INV-11 — Das Frontend laedt keine externe Ressource.
 *
 * Keine CDN-Schrift, kein Analytics, kein Icon von fremder Adresse. Wer dieses Dashboard
 * oeffnet, erzeugt keinen einzigen Netzverkehr, der diesen Rechner verlaesst — sonst
 * weiss ein Dritter, wann jemand auf sein Depot schaut, und ungefaehr wie lange.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSP, KOPFZEILEN } from '../../server/sicherheit.ts';
import { WURZEL, alsListe, dateien, sucheImCode } from './quellen.ts';

/**
 * Die einzigen fremden Adressen, die ein `href` in der Oberflaeche nennen darf — jede
 * fuehrt zu einem bewussten Klick, keine zu automatischem Netzverkehr beim Oeffnen der
 * Seite. Geschlossene Liste; ein weiterer Eintrag braucht eine eigene ADR. [ADR-021]
 */
const ERLAUBTE_AUSGEHENDE_LINKS = [/^https:\/\/www\.onvista\.de\//, /^https:\/\/ec\.europa\.eu\//, /^https:\/\/data\.ecb\.europa\.eu\//, /^https:\/\/scalable\.capital/, /^https:\/\/github\.com\/jx42\/Scapio\/releases/, /^https:\/\/github\.com\/jx42\/Scapio#readme$/];

function istErlaubterAusgehenderLink(adresse: string): boolean {
  return ERLAUBTE_AUSGEHENDE_LINKS.some((muster) => muster.test(adresse));
}

const OBERFLAECHE = dateien(['src']);
// `.css` separat: `dateien()` sucht sonst nur `.ts`/`.tsx` — ein `@import url(https://…)`
// oder eine `font-face`-Quelle in einer Stylesheet-Datei waere sonst unsichtbar.
const STYLES = dateien(['src'], ['.css']);
const OBERFLAECHE_MIT_STYLES = [...OBERFLAECHE, ...STYLES];
const INDEX = readFileSync(join(WURZEL, 'index.html'), 'utf8');

describe('INV-11 — nichts von aussen', () => {
  it('findet ueberhaupt Stylesheets', () => {
    expect(STYLES.length, 'Kein .css gefunden — der Test prueft nichts').toBeGreaterThan(0);
  });

  it('nennt in `src/` (Code und Stylesheets) keine fremde Adresse', () => {
    const treffer = sucheImCode(OBERFLAECHE_MIT_STYLES, /https?:\/\//).filter(
      (t) => !/https?:\/\/(127\.0\.0\.1|localhost)/.test(t.text),
    );
    expect(treffer, `Fremde Adresse:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('holt in `index.html` nichts von aussen', () => {
    const fremde = [...INDEX.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/g)]
      .map((m) => m[1]!)
      .filter((u) => /^(https?:)?\/\//.test(u));
    expect(fremde, `Fremde Ressource in index.html: ${fremde.join(', ')}`).toEqual([]);
  });

  it('bindet keine Schrift von fremder Adresse ein', () => {
    const treffer = sucheImCode([...OBERFLAECHE_MIT_STYLES, { pfad: 'index.html', inhalt: INDEX }], /fonts\.(googleapis|gstatic)|@import\s+url\s*\(\s*['"]?https?:|cdn\.|unpkg|jsdelivr/i);
    expect(treffer, `Fremde Schrift oder CDN:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('misst niemanden', () => {
    const treffer = sucheImCode(OBERFLAECHE, /gtag|googletagmanager|analytics|plausible|sentry|posthog|matomo/i);
    expect(treffer, `Messung:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('spricht nur mit dem eigenen Server', () => {
    // Jeder `fetch` geht an einen relativen Pfad — derselbe Ursprung, aus dem die
    // Seite geladen wurde. Eine absolute Adresse waere ein zweiter Ursprung.
    const rufe = sucheImCode(OBERFLAECHE, /\bfetch\s*\(/);
    expect(rufe.length, 'Kein fetch gefunden — der Test prueft nichts').toBeGreaterThan(0);
    const absolut = rufe.filter((t) => /fetch\s*\(\s*['"`]\s*(https?:)?\/\//.test(t.text));
    expect(absolut, `fetch an eine absolute Adresse:\n${alsListe(absolut)}`).toEqual([]);
  });

  it('setzt eine Content-Security-Policy, die nur den eigenen Ursprung erlaubt', () => {
    // Als Kopfzeile, nicht als `<meta>`: eine Kopfzeile deckt auch die API-Antworten
    // ab und laesst sich nicht durch eingeschleustes Markup ueberholen.
    expect(KOPFZEILEN.map(([name]) => name)).toContain('Content-Security-Policy');
    expect(CSP).toMatch(/default-src 'self'/);
    expect(CSP, 'CSP nennt eine fremde Adresse').not.toMatch(/https?:\/\//);
    expect(CSP, 'CSP erlaubt eine Verbindung nach aussen').toMatch(/connect-src 'self'/);
    for (const richtung of ['script-src', 'style-src', 'font-src', 'img-src']) {
      expect(CSP, `${richtung} fehlt`).toContain(richtung);
    }
    // `unsafe-inline` ist genau einmal erlaubt, und nur fuer `style`-ATTRIBUTE:
    // Recharts setzt sie auf seine SVG-Knoten. Skripte bleiben unangetastet.
    const gelockert = CSP.split('; ').filter((r) => r.includes('unsafe-inline') || r.includes('unsafe-eval'));
    expect(gelockert).toEqual(["style-src-attr 'unsafe-inline'"]);
    expect(CSP).toMatch(/script-src 'self'/);
  });

  it('bindet in `index.html` nur eigene Dateien und ein data:-Ziel ein', () => {
    const ziele = [...INDEX.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]!);
    for (const z of ziele) {
      // Ein data:-Ziel loest nie eine Netzwerkanfrage aus, egal welche Zeichen es
      // enthaelt — z. B. das SVG-Namensraum-Attribut eines Inline-Favicons.
      expect(z.startsWith('/') || z.startsWith('data:'), `Fremdes Ziel in index.html: ${z}`).toBe(true);
    }
  });

  it('laesst nach dem Bauen keine fremde Adresse in `dist/` zurueck', () => {
    const dist = join(WURZEL, 'dist');
    if (!existsSync(dist)) return; // Vor dem ersten Bauen gibt es nichts zu pruefen.
    const gefunden: string[] = [];
    const gehe = (verzeichnis: string): void => {
      for (const e of readdirSync(verzeichnis, { withFileTypes: true })) {
        const p = join(verzeichnis, e.name);
        if (e.isDirectory()) {
          gehe(p);
        } else if (/\.(js|css|html)$/.test(e.name)) {
          // Nur Stellen, an denen der Browser tatsaechlich etwas holt: `url(...)` im
          // CSS, `href`/`src` im HTML, ein dynamisches `import()` oder ein `fetch()`
          // im JavaScript. React legt seine Fehlerseiten-Adressen als Text in den
          // Bundle, Tailwind seine Projektadresse als Kommentar — beides laedt nichts.
          const inhalt = readFileSync(p, 'utf8');
          const holend = [
            /url\(\s*['"]?(https?:\/\/[^)'"\s]+)/g,
            /(?:href|src)\s*=\s*['"](https?:\/\/[^'"]+)/g,
            /(?:import|fetch)\s*\(\s*['"`](https?:\/\/[^'"`]+)/g,
          ];
          for (const muster of holend) {
            for (const m of inhalt.matchAll(muster)) {
              const u = m[1]!;
              if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) continue;
              if (istErlaubterAusgehenderLink(u)) continue;
              gefunden.push(`${e.name}: ${u}`);
            }
          }
        }
      }
    };
    gehe(dist);
    expect(gefunden, `Fremde Adresse im Bau:\n  ${gefunden.join('\n  ')}`).toEqual([]);
  });
});
