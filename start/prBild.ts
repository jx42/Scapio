/**
 * `npm run pr-bild -- <pr-nr> <kachel-id>…` — Bildschirmfotos fuer einen PR, ausschliesslich
 * aus der Demo (Skill `/push`). Das Repository ist oeffentlich: ein echtes Depot gehoert nie
 * ins Bild [ADR-042].
 *
 * Zwei Grenzen, weil ein Port allein nichts beweist: `einstellungen.json` lehnt die
 * Werkzeugports ab (`shared/konfiguration.ts`), und vor jedem Foto muss die Seite das
 * `<meta name="demo-modus">` tragen, das nur der Demo-Server einfuegt. Fehlt es, entsteht
 * kein Bild.
 */

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';
import { DEMO_PORT } from './demoServer.ts';

const DEMO_MERKMAL = 'meta[name="demo-modus"][content="true"]';

export type Auftrag = { readonly nummer: string; readonly kacheln: readonly string[] };

/** `null` bei falschen Argumenten — Nummer und ids landen in einem Dateinamen. */
export function auftragLesen(argumente: readonly string[]): Auftrag | null {
  const [nummer, ...kacheln] = argumente;
  if (nummer === undefined || !/^\d{1,6}$/.test(nummer) || kacheln.length === 0) return null;
  if (!kacheln.every((id) => /^[a-z][a-z0-9-]{0,40}$/.test(id))) return null;
  return { nummer, kacheln };
}

export async function istDemo(seite: Pick<Page, 'locator'>): Promise<boolean> {
  return (await seite.locator(DEMO_MERKMAL).count()) === 1;
}

export const bildPfad = (nummer: string, id: string): string => join(PROJEKTWURZEL, '.start', `pr-${nummer}-${id}.png`);

async function haupt(argumente: readonly string[]): Promise<number> {
  const auftrag = auftragLesen(argumente);
  if (auftrag === null) {
    process.stderr.write('Aufruf: npm run pr-bild -- <pr-nr> <kachel-id>…\n');
    return 2;
  }
  mkdirSync(join(PROJEKTWURZEL, '.start'), { recursive: true });

  const browser = await chromium.launch();
  try {
    const seite = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await seite.goto(`http://127.0.0.1:${String(DEMO_PORT)}/`);
    if (!(await istDemo(seite))) {
      process.stderr.write(`Auf Port ${String(DEMO_PORT)} laeuft nicht die Demo — kein Bild.\n`);
      return 1;
    }
    for (const id of auftrag.kacheln) {
      const kachel = seite.locator(`#${id}`);
      await kachel.waitFor();
      // Recharts animiert den Aufbau; ohne Pause zeigt das Bild halbe Balken.
      await seite.waitForTimeout(1500);
      const pfad = bildPfad(auftrag.nummer, id);
      await kachel.screenshot({ path: pfad });
      process.stdout.write(`${pfad}\n`);
    }
    return 0;
  } finally {
    await browser.close();
  }
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  process.exitCode = await haupt(process.argv.slice(2));
}
