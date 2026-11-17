/**
 * `npm run audit` — `npm audit` ab `high`, mit befristeten Ausnahmen. [ADR-068]
 *
 * `npm audit` kennt keine Ausnahme. Ein Fund ohne Fix in einem Paket, das `Start.*` zum Bauen
 * braucht (`vite` steht deshalb in `dependencies`), hielte sonst jeden Push an. Jede Ausnahme
 * nennt Advisory und Paket und laeuft ab; danach ist der Fund wieder rot.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { tagAus, type Tag } from '../core/kalender.ts';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';

export type Ausnahme = { readonly advisory: string; readonly paket: string; readonly bis: Tag };

export const AUSNAHMEN: readonly Ausnahme[] = [
  // ReDoS bei Extglobs; picomatch laeuft nur im Bau mit eigenen Mustern. Kein Fix fuer 4.x.
  { advisory: 'GHSA-fc5q-39xc-vjpf', paket: 'picomatch', bis: '2027-02-17' as Tag },
];

const SPERRSTUFEN = new Set(['high', 'critical']);

type Advisory = { readonly name?: unknown; readonly url?: unknown; readonly severity?: unknown };
type Bericht = {
  readonly error?: unknown;
  readonly vulnerabilities?: Readonly<Record<string, { readonly via?: readonly unknown[] }>>;
};

export type Bewertung = {
  /** `paket advisory`, je einmal. */
  readonly offen: readonly string[];
  readonly ausgenommen: readonly string[];
  readonly getroffen: ReadonlySet<Ausnahme>;
};

function advisoryId(url: unknown): string {
  return typeof url === 'string' ? (url.split('/').pop() ?? url) : 'unbekannt';
}

export function bewerte(bericht: Bericht, ausnahmen: readonly Ausnahme[], heute: Tag): Bewertung {
  if (bericht.error !== undefined || bericht.vulnerabilities === undefined) {
    throw new Error('npm audit lieferte keinen Bericht (Netz?).');
  }
  const offen = new Set<string>();
  const ausgenommen = new Set<string>();
  const getroffen = new Set<Ausnahme>();
  for (const eintrag of Object.values(bericht.vulnerabilities)) {
    for (const via of eintrag.via ?? []) {
      // Ein String verweist nur auf ein anderes Paket; dessen Advisory steht dort als Objekt.
      if (typeof via !== 'object' || via === null) continue;
      const a = via as Advisory;
      if (typeof a.severity !== 'string' || !SPERRSTUFEN.has(a.severity)) continue;
      const id = advisoryId(a.url);
      const paket = typeof a.name === 'string' ? a.name : 'unbekannt';
      const schluessel = `${paket} ${id}`;
      const ausnahme = ausnahmen.find((x) => x.advisory === id && x.paket === paket && heute <= x.bis);
      if (ausnahme === undefined) {
        offen.add(schluessel);
      } else {
        getroffen.add(ausnahme);
        ausgenommen.add(`${schluessel} (bis ${ausnahme.bis})`);
      }
    }
  }
  return { offen: [...offen], ausgenommen: [...ausgenommen], getroffen };
}

/** Gueltige Ausnahmen, die in keinem Bericht mehr greifen — koennen weg. */
export function ueberfluessig(ausnahmen: readonly Ausnahme[], getroffen: ReadonlySet<Ausnahme>, heute: Tag): string[] {
  return ausnahmen.filter((x) => !getroffen.has(x) && heute <= x.bis).map((x) => `${x.paket} ${x.advisory}`);
}

function audit(...argumente: readonly string[]): Bericht {
  const npm = process.env['npm_execpath'];
  if (npm === undefined) throw new Error('Bitte ueber "npm run audit" starten.');
  // npm audit endet bei jedem Fund mit 1; entscheidend ist der Bericht auf stdout.
  const lauf = spawnSync(process.execPath, [npm, 'audit', '--json', ...argumente], {
    cwd: PROJEKTWURZEL,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  try {
    return JSON.parse(lauf.stdout) as Bericht;
  } catch {
    throw new Error('npm audit lieferte kein JSON (Netz?).');
  }
}

function haupt(): void {
  const heute = tagAus(new Date().toISOString());
  let rot = false;
  const getroffen = new Set<Ausnahme>();
  for (const [name, argumente] of [
    ['Hauptpaket', ['--omit=dev']],
    ['demo-worker', ['--prefix', 'demo-worker']],
  ] as const) {
    const bewertung = bewerte(audit(...argumente), AUSNAHMEN, heute);
    for (const z of bewertung.ausgenommen) console.log(`${name}: ausgenommen ${z}`);
    for (const z of bewertung.offen) console.error(`${name}: offen ${z}`);
    for (const a of bewertung.getroffen) getroffen.add(a);
    if (bewertung.offen.length > 0) rot = true;
  }
  for (const z of ueberfluessig(AUSNAHMEN, getroffen, heute)) console.log(`Ausnahme trifft nichts mehr: ${z}`);
  if (rot) process.exitCode = 1;
  else console.log('Kein offener Fund ab high.');
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  try {
    haupt();
  } catch (fehler) {
    console.error((fehler as Error).message);
    process.exitCode = 1;
  }
}
