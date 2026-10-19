/**
 * Der e2e-Durchstich (Bauanleitung: "Playwright, ein Ablauf"). Sein Zweck ist eng:
 * beweisen, was jsdom nicht beweisen kann — dass die echte CSP (insbesondere
 * `style-src-attr 'unsafe-inline'`, zugestanden fuer Recharts) das echte Rendering eines
 * Recharts-Charts in einem echten Browser nicht verhindert, und dass jede Antwort exakt
 * die Sicherheits-Kopfzeilen aus `server/sicherheit.ts` traegt.
 *
 * Der zweite Teil ist der Barrierefreiheitsdurchlauf: axe gegen die fertig geladene Seite,
 * auch mit offenem Menue, Popover und Dialog, dazu die Befunde, die axe nicht sieht
 * (Sprungmarke, Ueberlauf bei schmalem Fenster, Fokus unter der Blende, fokussierbare
 * Tabellenregion). Dazu die Randschichten: Demo-Band, fehlender Server, Bauseite.
 * Siehe docs/BARRIEREFREIHEIT.md.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { KOPFZEILEN } from '../../server/sicherheit.ts';
import { hinweisseite, hinweisseiteCsp } from '../../server/server.ts';
import type { LaufSchritt } from '../../server/vertrag.ts';

declare global {
  interface Window {
    __cspVerstoesse?: string[];
    __nichtNeuGeladen?: boolean;
  }
}

test('Durchstich: echte CSP, echter Browser, echtes Recharts-Rendering', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspVerstoesse = [];
    document.addEventListener('securitypolicyviolation', (ereignis) => {
      window.__cspVerstoesse?.push(`${ereignis.violatedDirective}: ${ereignis.blockedURI}`);
    });
  });

  const antwort = await page.goto('/');
  expect(antwort).not.toBeNull();
  expect(antwort?.status()).toBe(200);

  const empfangeneKopfzeilen = antwort?.headers() ?? {};
  for (const [name, wert] of KOPFZEILEN) {
    expect(empfangeneKopfzeilen[name.toLowerCase()]).toBe(wert);
  }

  const chart = page.getByRole('img', { name: /Flächenchart/ });
  await expect(chart).toBeVisible();

  const svg = chart.locator('svg').first();
  await expect(svg).toBeVisible();
  const box = await svg.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThan(50);
  expect(box?.height ?? 0).toBeGreaterThan(50);

  const pfade = svg.locator('path[d]');
  await expect(pfade.first()).toBeAttached();
  const anzahlPfade = await pfade.count();
  let gefuellterPfad = false;
  for (let i = 0; i < anzahlPfade; i += 1) {
    const d = await pfade.nth(i).getAttribute('d');
    if (d !== null && d.trim().length > 0) {
      gefuellterPfad = true;
      break;
    }
  }
  expect(gefuellterPfad).toBe(true);

  const verstoesse = await page.evaluate(() => window.__cspVerstoesse ?? []);
  expect(verstoesse).toEqual([]);
});

/** Wartet, bis alle sechs Kacheln ihre Daten haben und kein Skeleton mehr steht. */
async function warteAufKacheln(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('img', { name: /Flächenchart/ })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('.recharts-pie')).toBeAttached();
}

async function erwarteAxeOhneVerstoss(page: Page, nur?: string): Promise<void> {
  const builder = new AxeBuilder({ page });
  const ergebnis = await (nur === undefined ? builder : builder.include(nur))
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(ergebnis.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test.describe('Barrierefreiheit', () => {
  // 375 px dazu: erst dort laeuft die Top25-Tabelle ueber und braucht ihre fokussierbare Region.
  for (const breite of [1280, 375]) {
    test(`axe findet auf der fertig geladenen Seite nichts (WCAG 2.2 AA, ${String(breite)} px)`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await warteAufKacheln(page);
      await erwarteAxeOhneVerstoss(page);
    });
  }

  // Portale (Menue, Popover, Dialog) stehen erst im DOM, wenn sie offen sind. Geprueft wird nur
  // die offene Ebene: Radix legt bei modalen Ebenen aria-hidden ueber den Rest, den die Fokusfalle
  // sperrt — axe meldete dort aria-hidden-focus. Die geschlossene Seite prueft der Test oben.
  test('axe findet auch mit offenem Menue, Popover und Dialog nichts', async ({ page }) => {
    await warteAufKacheln(page);

    await page.locator('[data-slot="dropdown-menu-trigger"]').first().click();
    await expect(page.getByRole('menu')).toBeVisible();
    await erwarteAxeOhneVerstoss(page, '[role="menu"]');
    await page.keyboard.press('Escape');

    await page.locator('[data-slot="popover-trigger"]').first().click();
    await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();
    await erwarteAxeOhneVerstoss(page, '[data-slot="popover-content"]');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /^Transaktionen anzeigen/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await erwarteAxeOhneVerstoss(page, '[role="dialog"]');
  });

  test('der Dialog gibt den Fokus beim Schliessen an seinen Ausloeser zurueck', async ({ page }) => {
    await warteAufKacheln(page);
    const ausloeser = page.getByRole('button', { name: /^Transaktionen anzeigen/ }).first();
    await ausloeser.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(ausloeser).toBeFocused();
  });

  test('der Sprunglink setzt den Fokus auf die Kacheln', async ({ page }) => {
    await warteAufKacheln(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('main#kacheln')).toBeFocused();
  });

  for (const breite of [375, 320]) {
    test(`bei ${String(breite)} px laeuft die Seite nicht waagerecht ueber`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await warteAufKacheln(page);
      const breiten = await page.evaluate(() => {
        const liste = document.getElementById('kennzahlen-liste');
        return {
          inhalt: document.documentElement.scrollWidth,
          fenster: document.documentElement.clientWidth,
          kennzahlenUeberlauf: liste === null ? 0 : liste.scrollWidth - liste.clientWidth,
        };
      });
      expect(breiten.inhalt).toBe(breiten.fenster);
      expect(breiten.kennzahlenUeberlauf).toBeLessThanOrEqual(0);
    });
  }

  test('die ueberlaufende Top25-Tabelle ist eine fokussierbare Region', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await warteAufKacheln(page);
    const region = page.getByRole('region', { name: /^Unternehmen \d+ bis \d+/ });
    await expect(region).toHaveAttribute('tabindex', '0');
    await region.focus();
    await expect(region).toBeFocused();
  });

  test('kein fokussierbares Element liegt unter der Blende der Kennzahlen', async ({ page }) => {
    await warteAufKacheln(page);
    const verdeckt = await page.evaluate(() => {
      const rahmen = document.querySelector('.ausblenden-unten');
      if (rahmen === null) return [];
      const unten = rahmen.getBoundingClientRect().bottom;
      const ziele = rahmen.querySelectorAll<HTMLElement>('a, button, [tabindex]');
      return [...ziele]
        .filter((z) => z.getBoundingClientRect().bottom > unten && !z.closest('[inert]') && getComputedStyle(z).visibility !== 'hidden')
        .map((z) => z.getAttribute('aria-label') ?? z.textContent ?? '');
    });
    expect(verdeckt).toEqual([]);
  });

  test('bei 320 px und Textabstand nach WCAG 1.4.12 laeuft nichts ueber und nichts wird abgeschnitten', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await warteAufKacheln(page);
    const befund = await page.evaluate(() => {
      // Ueber CSSOM statt <style>: die echte CSP sperrt Inline-Stile, und `bypassCSP` bleibt aus.
      const abstand = new CSSStyleSheet();
      abstand.replaceSync(
        '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
      );
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, abstand];
      const gekuerzt = [...document.querySelectorAll<HTMLElement>('body *')].filter(
        (e) => getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth,
      );
      return {
        ueberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        gekuerzt: gekuerzt.map((e) => e.textContent ?? ''),
      };
    });
    expect(befund).toEqual({ ueberlauf: 0, gekuerzt: [] });
  });
});

/** Die Seite wie im Demo-Modus: dieselbe Antwort, nur mit dem Kennzeichen des Demo-Servers. */
async function alsDemo(page: Page): Promise<void> {
  await page.route('/', async (route) => {
    const antwort = await route.fetch();
    const body = (await antwort.text()).replace('</head>', '<meta name="demo-modus" content="true"></head>');
    await route.fulfill({ response: antwort, body });
  });
}

test.describe('Barrierefreiheit der Randschichten', () => {
  for (const breite of [1280, 375]) {
    test(`axe findet im Demo-Modus nichts (${String(breite)} px)`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await alsDemo(page);
      await warteAufKacheln(page);
      await expect(page.locator('[data-demo-band]')).toBeVisible();
      await erwarteAxeOhneVerstoss(page);
    });
  }

  test('das Demo-Band verdeckt den Sprunglink nicht', async ({ page }) => {
    await alsDemo(page);
    await warteAufKacheln(page);
    await page.keyboard.press('Tab');
    const sprunglink = page.locator('a[href="#kacheln"]');
    await expect(sprunglink).toBeFocused();
    const obenauf = await sprunglink.evaluate((a) => {
      const { left, top, width, height } = a.getBoundingClientRect();
      return document.elementFromPoint(left + width / 2, top + height / 2) === a;
    });
    expect(obenauf).toBe(true);
  });

  test('ohne Server meldet die Seite den Fehler einmal und axe findet nichts', async ({ page }) => {
    await page.route('/api/**', (route) => route.abort('connectionrefused'));
    await page.goto('/');
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole('alert')).toHaveCount(1);
    await erwarteAxeOhneVerstoss(page);
  });

  test('die Bauseite laedt sich nicht neu, sondern sagt den neuen Schritt an', async ({ page }) => {
    const nonce = 'e2e';
    let schritt: LaufSchritt = 'kurse';
    await page.route('/', (route) =>
      route.fulfill({
        headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': hinweisseiteCsp(nonce) },
        body: hinweisseite(nonce, { status: 'laufend', schritt }),
      }),
    );
    await page.goto('/');
    await erwarteAxeOhneVerstoss(page);
    await page.evaluate(() => {
      window.__nichtNeuGeladen = true;
    });
    schritt = 'fonds';
    await expect(page.getByRole('status')).toContainText('Wertpapiere einordnen');
    expect(await page.evaluate(() => window.__nichtNeuGeladen)).toBe(true);
  });
});
