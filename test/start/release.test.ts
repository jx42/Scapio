/** Release-Skript [ADR-067]: Entscheidungen und Ablauf, mit einer unechten Umgebung statt git, gh und Netz. */

import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  haupt,
  healthVersion,
  labelUebersicht,
  naechsteVersion,
  neuerLauf,
  pruefsummeAus,
  tokenGueltig,
  versionHoeher,
  versionTeile,
  type LaufOptionen,
  type Umgebung,
} from '../../start/release.ts';

const pr = (number: number, ...labels: string[]) => ({ number, labels: labels.map((name) => ({ name })) });

describe('release: reine Teile', () => {
  it('liest nur X.Y.Z', () => {
    expect(versionTeile('1.12.3')).toEqual([1, 12, 3]);
    expect(versionTeile('v1.2.3')).toBeNull();
    expect(versionTeile('1.2')).toBeNull();
    expect(versionTeile('1.2.3-rc.1')).toBeNull();
  });

  it('vergleicht Stelle für Stelle, nicht als Text', () => {
    expect(versionHoeher('1.10.0', '1.9.9')).toBe(true);
    expect(versionHoeher('2.0.0', '1.99.99')).toBe(true);
    expect(versionHoeher('1.1.0', '1.1.0')).toBe(false);
    expect(versionHoeher('1.0.9', '1.1.0')).toBe(false);
    expect(versionHoeher('x', '1.1.0')).toBe(false);
  });

  it('hebt bei `neu` die zweite Stelle, sonst die dritte', () => {
    expect(naechsteVersion('1.1.3', [pr(1, 'korrektur'), pr(2, 'neu', 'intern')])).toBe('1.2.0');
    expect(naechsteVersion('1.1.3', [pr(1, 'korrektur'), pr(2, 'intern'), pr(3)])).toBe('1.1.4');
    expect(() => naechsteVersion('kaputt', [])).toThrow();
  });

  it('zählt je Label und nennt PRs ohne bekanntes Label', () => {
    expect(labelUebersicht([pr(1, 'neu'), pr(2, 'neu', 'korrektur'), pr(3), pr(4, 'wip'), pr(5, 'dependencies')])).toEqual({
      je: { neu: 2, korrektur: 1, dependencies: 1 },
      ohne: [3, 4],
    });
  });

  it('findet den Lauf, den es vorher nicht gab', () => {
    const vorher = new Set([10, 9]);
    expect(neuerLauf(vorher, [{ databaseId: 11 }, { databaseId: 10 }])).toBe(11);
    expect(neuerLauf(vorher, [{ databaseId: 10 }, { databaseId: 9 }])).toBeNull();
  });

  it('liest den Hash aus SHA256SUMS, auch im Binärmodus', () => {
    const h = 'a'.repeat(64);
    expect(pruefsummeAus(`${h}  Scapio.zip\n`, 'Scapio.zip')).toBe(h);
    expect(pruefsummeAus(`${h} *Scapio.zip`, 'Scapio.zip')).toBe(h);
    expect(pruefsummeAus(`${h}  Anders.zip\n`, 'Scapio.zip')).toBeNull();
    expect(pruefsummeAus('kurz  Scapio.zip', 'Scapio.zip')).toBeNull();
  });

  it('nimmt die Version aus /api/health nur als Text', () => {
    expect(healthVersion({ version: '1.2.0', ok: true })).toBe('1.2.0');
    expect(healthVersion({ version: 1 })).toBeNull();
    expect(healthVersion(null)).toBeNull();
    expect(healthVersion('1.2.0')).toBeNull();
  });

  it('lässt nur Token-Zeichen durch, die `security -i` ohne Quoting liest', () => {
    expect(tokenGueltig('Abc_def-0123456789xyzXYZ')).toBe(true);
    expect(tokenGueltig('kurz')).toBe(false);
    expect(tokenGueltig('abcdefghijklmnopqrstuvwxyz -w x')).toBe(false);
    expect(tokenGueltig('abcdefghijklmnopqrstuvwxyz\nadd')).toBe(false);
  });
});

// ── unechte Umgebung ─────────────────────────────────────────────────────────────────────

type Aufruf = { readonly zeile: string; readonly argumente: readonly string[]; readonly optionen: LaufOptionen | undefined };
type Antwort = string | (() => string);

const ZIP = 'zip-inhalt';
const HASH = createHash('sha256').update(ZIP).digest('hex');
const TOKEN = 'Abc_def-0123456789xyzXYZ';
const NPM = '/npm-cli.js';

function umgebung(
  o: {
    readonly version?: string;
    readonly aus?: Record<string, Antwort>;
    readonly lauf?: (zeile: string) => number | undefined;
    readonly frage?: boolean;
    readonly health?: readonly unknown[];
    readonly npmCli?: string | undefined;
    readonly sums?: string;
  } = {},
) {
  const laeufe: Aufruf[] = [];
  const texte: string[] = [];
  const ordner: string[] = [];
  const health = [...(o.health ?? [{ version: o.version ?? '1.3.0' }])];
  let abrufe = 0;
  let ausgeloest = false;
  const antworten: Record<string, Antwort> = {
    'git fetch -q --tags origin main': '',
    'git fetch -q --tags origin': '',
    'git branch --show-current': 'main',
    'git status --porcelain': '',
    'git rev-parse HEAD': 'abc',
    'git rev-parse origin/main': 'abc',
    'git rev-parse --short HEAD': 'abc',
    'git rev-parse v1.3.0^{commit}': 'abc',
    'git ls-remote --tags origin refs/tags/v1.3.0': '',
    'gh run list --workflow release.yml --event workflow_dispatch --limit 10 --json databaseId': () =>
      ausgeloest ? '[{"databaseId":6},{"databaseId":5}]' : '[{"databaseId":5}]',
    'gh repo view jx42/Scapio --json visibility -q .visibility': 'PUBLIC',
    ...o.aus,
  };

  const u: Umgebung = {
    aus: (befehl, argumente) => {
      const zeile = [befehl, ...argumente].join(' ');
      const a = antworten[zeile];
      if (a === undefined) throw new Error(`unerwartet: ${zeile}`);
      return typeof a === 'function' ? a() : a;
    },
    lauf: (befehl, argumente, optionen) => {
      const zeile = [befehl === process.execPath ? 'node' : befehl, ...argumente].join(' ');
      laeufe.push({ zeile, argumente, optionen });
      const eigen = o.lauf?.(zeile);
      if (eigen !== undefined) return eigen;
      if (zeile.startsWith('gh workflow run')) ausgeloest = true;
      if (zeile.startsWith('gh release download')) {
        const ziel = argumente[argumente.indexOf('-D') + 1] ?? '';
        ordner.push(ziel);
        writeFileSync(join(ziel, 'Scapio.zip'), ZIP);
        writeFileSync(join(ziel, 'SHA256SUMS'), o.sums ?? `${HASH}  Scapio.zip\n`);
      }
      return 0;
    },
    npmCli: 'npmCli' in o ? o.npmCli : NPM,
    paketJson: () => JSON.stringify({ version: o.version ?? '1.3.0' }),
    frage: () => Promise.resolve(o.frage ?? true),
    token: () => Promise.resolve(TOKEN),
    abrufen: () => {
      abrufe++;
      return Promise.resolve(health.length > 1 ? health.shift() : health[0]);
    },
    warten: () => Promise.resolve(),
    schreiben: (text) => texte.push(text),
  };

  return {
    u,
    zeilen: () => laeufe.map((l) => l.zeile),
    lauf: (teil: string) => laeufe.find((l) => l.zeile.includes(teil)),
    ausgabe: () => texte.join(''),
    ordner,
    abrufe: () => abrufe,
  };
}

const leak = (zeile: string) => zeile.endsWith('leakPruefung.ts');

// ── npm run release ──────────────────────────────────────────────────────────────────────

describe('release: npm run release', () => {
  it('löst aus, prüft das ZIP, deployt die Demo und wartet auf die Version', async () => {
    const f = umgebung();
    expect(await haupt([], f.u)).toBe(0);
    const z = f.zeilen();
    const stelle = (teil: string) => z.findIndex((l) => l.includes(teil));
    expect(stelle('leakPruefung.ts')).toBeLessThan(stelle('gh workflow run release.yml --ref main'));
    expect(stelle('gh run watch 6 --exit-status')).toBeGreaterThan(stelle('gh workflow run'));
    expect(stelle('gh attestation verify')).toBeGreaterThan(stelle('gh release download v1.3.0'));
    expect(stelle(`${NPM} run demo:export`)).toBeGreaterThan(stelle('gh attestation verify'));
    expect(f.lauf(`${NPM} audit --audit-level=high`)?.optionen?.cwd).toMatch(/demo-worker$/);
    expect(f.lauf('wrangler.js deploy')?.optionen?.env?.['CLOUDFLARE_API_TOKEN']).toBe(TOKEN);
    expect(f.ordner.every((o) => !existsSync(o))).toBe(true);
    expect(f.ausgabe()).toContain('meldet 1.3.0');
    expect(f.ausgabe()).toContain('releases/tag/v1.3.0');
  });

  it('wartet, bis die Demo die neue Version meldet', async () => {
    const f = umgebung({ health: [null, { version: '1.2.0' }, { version: '1.3.0' }] });
    expect(await haupt([], f.u)).toBe(0);
    expect(f.abrufe()).toBe(3);
  });

  it.each([
    ['nicht auf main', { 'git branch --show-current': 'feature' }, 'Nicht auf main'],
    ['nicht sauber', { 'git status --porcelain': ' M x' }, 'nicht sauber'],
    ['hinter origin/main', { 'git rev-parse origin/main': 'def' }, 'weicht von origin/main ab'],
    ['Tag schon da', { 'git ls-remote --tags origin refs/tags/v1.3.0': 'x\trefs/tags/v1.3.0' }, 'gibt es schon'],
  ])('hält an vor dem Auslösen: %s', async (_, aus, meldung) => {
    const f = umgebung({ aus });
    expect(await haupt([], f.u)).toBe(1);
    expect(f.ausgabe()).toContain(meldung);
    expect(f.zeilen()).toEqual([]);
  });

  it('löst bei Befunden der Leak-Prüfung nichts aus', async () => {
    const f = umgebung({ lauf: (z) => (leak(z) ? 1 : undefined) });
    expect(await haupt([], f.u)).toBe(1);
    expect(f.ausgabe()).toContain('Leak-Prüfung hat Befunde');
    expect(f.lauf('gh workflow run')).toBeUndefined();
  });

  it('löst ohne Ja nichts aus', async () => {
    const f = umgebung({ frage: false });
    expect(await haupt([], f.u)).toBe(1);
    expect(f.ausgabe()).toContain('Nicht ausgelöst');
    expect(f.lauf('gh workflow run')).toBeUndefined();
  });

  it('gibt auf, wenn der Lauf nicht erscheint', async () => {
    const f = umgebung({ aus: { 'gh run list --workflow release.yml --event workflow_dispatch --limit 10 --json databaseId': '[{"databaseId":5}]' } });
    expect(await haupt([], f.u)).toBe(1);
    expect(f.ausgabe()).toContain('erscheint nicht');
  });

  it('deployt nicht nach rotem Lauf', async () => {
    const f = umgebung({ lauf: (z) => (z.startsWith('gh run watch') ? 1 : undefined) });
    expect(await haupt([], f.u)).toBe(1);
    expect(f.ausgabe()).toContain('Release-Lauf 6 ist rot');
    expect(f.lauf('wrangler.js')).toBeUndefined();
  });

  it('deployt nicht, wenn die Prüfsumme nicht passt, und räumt den Download weg', async () => {
    const f = umgebung({ sums: `${'0'.repeat(64)}  Scapio.zip\n` });
    expect(await haupt([], f.u)).toBe(1);
    expect(f.ausgabe()).toContain('SHA256SUMS passt nicht');
    expect(f.lauf('wrangler.js')).toBeUndefined();
    expect(f.ordner.length).toBe(1);
    expect(f.ordner.every((o) => !existsSync(o))).toBe(true);
  });

  it('prüft bei privatem Repository keine Attestation', async () => {
    const f = umgebung({ aus: { 'gh repo view jx42/Scapio --json visibility -q .visibility': 'PRIVATE' } });
    expect(await haupt([], f.u)).toBe(0);
    expect(f.lauf('gh attestation')).toBeUndefined();
    expect(f.ausgabe()).toContain('keine Attestation');
  });

  it('bricht bei roter Attestation ab', async () => {
    const f = umgebung({ lauf: (z) => (z.startsWith('gh attestation') ? 1 : undefined) });
    expect(await haupt([], f.u)).toBe(1);
    expect(f.ausgabe()).toContain('Fehlgeschlagen: gh attestation verify');
  });

  it('meldet einen gescheiterten Deploy mit dem Weg zum neuen Token', async () => {
    const f = umgebung({ lauf: (z) => (z.includes('wrangler.js') ? 1 : undefined) });
    expect(await haupt([], f.u)).toBe(1);
    expect(f.ausgabe()).toContain('security delete-generic-password -s scapio-demo-deploy');
  });

  it('meldet, wenn die Demo die Version nicht zeigt', async () => {
    const f = umgebung({ health: [{ version: '1.2.0' }] });
    expect(await haupt([], f.u)).toBe(1);
    expect(f.abrufe()).toBe(6);
    expect(f.ausgabe()).toContain('meldet nicht 1.3.0');
  });

  it('nennt den node-Befehl ohne absoluten Pfad, wenn npm scheitert', async () => {
    const f = umgebung({ lauf: (z) => (z.includes('demo:export') ? 1 : undefined) });
    expect(await haupt([], f.u)).toBe(1);
    expect(f.ausgabe()).toContain(`Fehlgeschlagen: node ${NPM} run demo:export`);
  });

  it('braucht npm_execpath', async () => {
    const f = umgebung({ npmCli: undefined });
    expect(await haupt(['--nur-demo'], f.u)).toBe(1);
    expect(f.ausgabe()).toContain('über `npm run release`');
  });

  it('lehnt eine kaputte package.json-Version ab', async () => {
    const f = umgebung({ version: '1.3' });
    expect(await haupt([], f.u)).toBe(1);
    expect(f.ausgabe()).toContain('Ungültige Version in package.json: 1.3');
  });

  it('lässt fremde Fehler durch', async () => {
    const f = umgebung({ aus: { 'git branch --show-current': () => { throw new TypeError('kaputt'); } } });
    await expect(haupt([], f.u)).rejects.toThrow('kaputt');
  });
});

describe('release: --nur-demo', () => {
  it('deployt nur die Demo, ohne Leak-Prüfung und Workflow', async () => {
    const f = umgebung({ aus: { 'git branch --show-current': 'unwichtig' } });
    expect(await haupt(['--nur-demo'], f.u)).toBe(0);
    expect(f.zeilen().some(leak)).toBe(false);
    expect(f.lauf('gh ')).toBeUndefined();
    expect(f.lauf('wrangler.js deploy')).toBeDefined();
  });

  it('baut nur auf genau dem Tag', async () => {
    const f = umgebung({ aus: { 'git rev-parse v1.3.0^{commit}': 'tag' } });
    expect(await haupt(['--nur-demo'], f.u)).toBe(1);
    expect(f.ausgabe()).toContain('git switch --detach v1.3.0');
    expect(f.zeilen()).toEqual([]);
  });
});

// ── npm run release:vorbereiten ──────────────────────────────────────────────────────────

const PR_LISTE = 'gh pr list --state merged --base main --limit 300 --json number,labels,mergedAt';

function vorbereitung(
  o: { readonly prs?: readonly (ReturnType<typeof pr> & { mergedAt: string })[]; readonly aus?: Record<string, Antwort>; readonly lauf?: (zeile: string) => number | undefined } = {},
) {
  let checks = 0;
  return umgebung({
    version: '1.2.0',
    aus: {
      'git ls-remote --tags origin refs/tags/v1.2.0': 'x\trefs/tags/v1.2.0',
      'git log -1 --format=%cI v1.2.0': '2026-11-01T10:00:00+01:00',
      [PR_LISTE]: JSON.stringify(
        o.prs ?? [
          { ...pr(1, 'neu'), mergedAt: '2026-10-30T10:00:00Z' },
          { ...pr(2, 'korrektur'), mergedAt: '2026-11-02T10:00:00Z' },
          { ...pr(3), mergedAt: '2026-11-03T10:00:00Z' },
        ],
      ),
      'gh pr view --json number -q .number': '61',
      'gh pr checks 61 --json name': () => {
        checks++;
        if (checks === 1) throw new Error('noch keine Checks');
        return checks === 2 ? '[]' : '[{"name":"pruefung"}]';
      },
      ...o.aus,
    },
    ...(o.lauf === undefined ? {} : { lauf: o.lauf }),
  });
}

describe('release: npm run release:vorbereiten', () => {
  it('leitet die Version aus den Labels seit dem Tag ab und begleitet den PR', async () => {
    const f = vorbereitung();
    expect(await haupt(['vorbereiten'], f.u)).toBe(0);
    expect(f.ausgabe()).toContain('Seit v1.2.0: 2 PRs (korrektur 1)');
    expect(f.ausgabe()).toContain('Ohne Label, landen unter „Sonstiges“: #3');
    expect(f.ausgabe()).toContain('Neue Version: 1.2.1 (aus den Labels');
    expect(f.zeilen().filter((z) => !leak(z))).toEqual([
      'git switch -c version-1.2.1',
      `node ${NPM} version 1.2.1 --no-git-tag-version`,
      'git add package.json package-lock.json',
      'git commit -q -m Version 1.2.1',
      'git push -q -u origin version-1.2.1',
      'gh pr create --title Version 1.2.1 --label ohne-notiz --body Release v1.2.1: danach `npm run release`.',
      'gh pr checks 61 --watch --interval 20',
      'git switch -q main',
    ]);
    expect(f.zeilen().findIndex(leak)).toBe(0);
    expect(f.ausgabe()).toContain('#61 ist grün');
  });

  it('nimmt eine gewünschte Version', async () => {
    const f = vorbereitung();
    expect(await haupt(['vorbereiten', '2.0.0'], f.u)).toBe(0);
    expect(f.lauf('git switch -c')?.zeile).toBe('git switch -c version-2.0.0');
    expect(f.ausgabe()).not.toContain('aus den Labels');
  });

  it.each([
    ['v2.0.0', 'Aufruf: npm run release:vorbereiten'],
    ['1.1.9', '1.1.9 ist nicht höher als 1.2.0'],
  ])('lehnt %s ab', async (wunsch, meldung) => {
    const f = vorbereitung();
    expect(await haupt(['vorbereiten', wunsch], f.u)).toBe(1);
    expect(f.ausgabe()).toContain(meldung);
    expect(f.zeilen()).toEqual([]);
  });

  it('verlangt, dass die aktuelle Version schon getaggt ist', async () => {
    const f = vorbereitung({ aus: { 'git ls-remote --tags origin refs/tags/v1.2.0': '' } });
    expect(await haupt(['vorbereiten'], f.u)).toBe(1);
    expect(f.ausgabe()).toContain('der Tag fehlt noch');
  });

  it('macht ohne neue PRs keine Version', async () => {
    const f = vorbereitung({ prs: [{ ...pr(1, 'neu'), mergedAt: '2026-10-30T10:00:00Z' }] });
    expect(await haupt(['vorbereiten'], f.u)).toBe(1);
    expect(f.ausgabe()).toContain('Seit v1.2.0 ist nichts gemergt');
  });

  it('legt bei Befunden der Leak-Prüfung keinen Branch an', async () => {
    const f = vorbereitung({ lauf: (z) => (leak(z) ? 1 : undefined) });
    expect(await haupt(['vorbereiten'], f.u)).toBe(1);
    expect(f.lauf('git switch')).toBeUndefined();
  });

  it('kehrt bei roter CI auf main zurück und meldet es', async () => {
    const f = vorbereitung({ lauf: (z) => (z.includes('--watch') ? 1 : undefined) });
    expect(await haupt(['vorbereiten'], f.u)).toBe(1);
    expect(f.zeilen().at(-1)).toBe('git switch -q main');
    expect(f.ausgabe()).toContain('CI von #61 ist nicht grün');
  });
});
