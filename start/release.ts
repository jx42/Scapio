/**
 * Der Release aus docs/ENTWICKLUNG.md#release als zwei Befehle [ADR-067].
 *
 *   npm run release:vorbereiten [-- X.Y.Z]   Leak-Prüfung, Versions-PR, CI begleiten
 *   npm run release                          Leak-Prüfung, Workflow, ZIP prüfen, Demo deployen
 *   npm run release -- --nur-demo            nur die Demo, auf dem ausgecheckten Tag
 *
 * Nur für den Nutzer: Die Leak-Prüfung liest die echte Datenbank, der Deploy braucht den
 * Cloudflare-Token [ADR-042, ADR-054]. Gemergt wird von Hand [ADR-051].
 *
 * Unterprozesse ohne Shell; npm über `npm_execpath`, wrangler über seine JS-Datei. Alles, was
 * nach außen greift, steckt in `Umgebung`: Der Ablauf läuft selten, Fehler darin fielen sonst
 * erst beim Release auf.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as warten } from 'node:timers/promises';

const WURZEL = resolve(import.meta.dirname, '..');
const WORKER = join(WURZEL, 'demo-worker');
const REPO = 'jx42/Scapio';
const DEMO_ADRESSE = 'https://scapio.jroehm.workers.dev';
/** Eintrag im macOS-Schlüsselbund; Konto-Feld fest, damit genau ein Eintrag passt. */
export const SCHLUESSEL = { dienst: 'scapio-demo-deploy', konto: 'cloudflare' } as const;
const LABELS = ['neu', 'korrektur', 'intern', 'ohne-notiz', 'dependencies'] as const;

// ── rein ─────────────────────────────────────────────────────────────────────────────────

export function versionTeile(text: string): readonly [number, number, number] | null {
  const t = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  return t === null ? null : [Number(t[1]), Number(t[2]), Number(t[3])];
}

export function versionHoeher(neu: string, alt: string): boolean {
  const n = versionTeile(neu);
  const a = versionTeile(alt);
  if (n === null || a === null) return false;
  for (let i = 0; i < 3; i++) if (n[i] !== a[i]) return (n[i] ?? 0) > (a[i] ?? 0);
  return false;
}

export type Pr = { readonly number: number; readonly labels: readonly { readonly name: string }[] };

/** SemVer nach den Labels: `neu` hebt die zweite Stelle, sonst die dritte. Die erste nie von selbst. */
export function naechsteVersion(aktuell: string, prs: readonly Pr[]): string {
  const v = versionTeile(aktuell);
  if (v === null) throw new Error(`Ungültige Version in package.json: ${aktuell}`);
  const neu = prs.some((p) => p.labels.some((l) => l.name === 'neu'));
  return neu ? `${String(v[0])}.${String(v[1] + 1)}.0` : `${String(v[0])}.${String(v[1])}.${String(v[2] + 1)}`;
}

/** Zählung je Label und die PRs ohne bekanntes Label — die landen in den Notizen unter „Sonstiges“. */
export function labelUebersicht(prs: readonly Pr[]): { readonly je: Record<string, number>; readonly ohne: readonly number[] } {
  const je: Record<string, number> = {};
  const ohne: number[] = [];
  for (const p of prs) {
    const bekannt = p.labels.map((l) => l.name).filter((n) => (LABELS as readonly string[]).includes(n));
    if (bekannt.length === 0) ohne.push(p.number);
    for (const n of bekannt) je[n] = (je[n] ?? 0) + 1;
  }
  return { je, ohne };
}

/** Der erste Lauf, den es vor dem Auslösen noch nicht gab — ohne Uhrvergleich mit GitHub. */
export function neuerLauf(vorher: ReadonlySet<number>, laeufe: readonly { readonly databaseId: number }[]): number | null {
  return laeufe.find((l) => !vorher.has(l.databaseId))?.databaseId ?? null;
}

/** Hash zu `datei` aus einer `sha256sum`-Ausgabe. */
export function pruefsummeAus(sums: string, datei: string): string | null {
  for (const zeile of sums.split('\n')) {
    const t = /^([0-9a-f]{64}) [ *](.+)$/.exec(zeile.trim());
    if (t?.[2] === datei) return t[1] ?? null;
  }
  return null;
}

export function healthVersion(antwort: unknown): string | null {
  if (typeof antwort !== 'object' || antwort === null || !('version' in antwort)) return null;
  return typeof antwort.version === 'string' ? antwort.version : null;
}

/** Ein Cloudflare-Token geht über stdin an `security -i` — nur Zeichen, die dort kein Quoting brauchen. */
export function tokenGueltig(token: string): boolean {
  return /^[A-Za-z0-9_-]{20,200}$/.test(token);
}

// ── Umgebung ─────────────────────────────────────────────────────────────────────────────

export class Abbruch extends Error {}

export type LaufOptionen = { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv };

export type Umgebung = {
  /** Ausgabe eines Befehls im Projekt; wirft `Abbruch`, wenn er scheitert. */
  readonly aus: (befehl: string, argumente: readonly string[]) => string;
  /** Befehl mit Ausgabe im Terminal; gibt den Exit-Code zurück. */
  readonly lauf: (befehl: string, argumente: readonly string[], optionen?: LaufOptionen) => number;
  readonly npmCli: string | undefined;
  readonly paketJson: () => string;
  readonly frage: (text: string) => Promise<boolean>;
  readonly token: () => Promise<string>;
  readonly abrufen: (adresse: string) => Promise<unknown>;
  readonly warten: (ms: number) => Promise<unknown>;
  readonly schreiben: (text: string) => void;
};

function muss(u: Umgebung, befehl: string, argumente: readonly string[], optionen?: LaufOptionen): void {
  if (u.lauf(befehl, argumente, optionen) !== 0) {
    throw new Abbruch(`Fehlgeschlagen: ${befehl === process.execPath ? 'node' : befehl} ${argumente.join(' ')}`);
  }
}

/** npm ohne Shell: `npm run` setzt `npm_execpath` auf `npm-cli.js`, auf jeder Plattform. */
function npm(u: Umgebung, argumente: readonly string[], cwd = WURZEL): void {
  if (u.npmCli === undefined || u.npmCli === '') throw new Abbruch('Bitte über `npm run release` starten.');
  muss(u, process.execPath, [u.npmCli, ...argumente], { cwd });
}

// ── Schritte ─────────────────────────────────────────────────────────────────────────────

function paketVersion(u: Umgebung): string {
  const v = (JSON.parse(u.paketJson()) as { version?: unknown }).version;
  if (typeof v !== 'string' || versionTeile(v) === null) throw new Abbruch(`Ungültige Version in package.json: ${String(v)}`);
  return v;
}

function tagExistiert(u: Umgebung, version: string): boolean {
  return u.aus('git', ['ls-remote', '--tags', 'origin', `refs/tags/v${version}`]) !== '';
}

function sauber(u: Umgebung): void {
  if (u.aus('git', ['status', '--porcelain']) !== '') throw new Abbruch('Arbeitskopie nicht sauber — erst committen oder weglegen.');
}

/** Auf `main`, sauber, gleich `origin/main`: Was geprüft und getaggt wird, ist genau dieser Stand. */
function aufMain(u: Umgebung): void {
  u.aus('git', ['fetch', '-q', '--tags', 'origin', 'main']);
  if (u.aus('git', ['branch', '--show-current']) !== 'main') throw new Abbruch('Nicht auf main — `git switch main && git pull --ff-only`.');
  sauber(u);
  if (u.aus('git', ['rev-parse', 'HEAD']) !== u.aus('git', ['rev-parse', 'origin/main'])) {
    throw new Abbruch('main weicht von origin/main ab — `git pull --ff-only`.');
  }
}

function leakPruefung(u: Umgebung): void {
  u.schreiben('\n▸ Leak-Prüfung\n');
  const status = u.lauf(process.execPath, ['--disable-warning=ExperimentalWarning', '--experimental-strip-types', join(WURZEL, 'start', 'leakPruefung.ts')]);
  if (status !== 0) throw new Abbruch('Leak-Prüfung hat Befunde — beheben (eigener PR), dann erneut.');
}

async function vorbereiten(u: Umgebung, wunsch: string | undefined): Promise<void> {
  aufMain(u);
  const aktuell = paketVersion(u);
  if (!tagExistiert(u, aktuell)) throw new Abbruch(`package.json steht auf ${aktuell}, der Tag fehlt noch — \`npm run release\`.`);

  const tagZeit = new Date(u.aus('git', ['log', '-1', '--format=%cI', `v${aktuell}`]));
  const liste = u.aus('gh', ['pr', 'list', '--state', 'merged', '--base', 'main', '--limit', '300', '--json', 'number,labels,mergedAt']);
  const prs = (JSON.parse(liste) as (Pr & { mergedAt: string })[]).filter((p) => new Date(p.mergedAt) > tagZeit);
  if (prs.length === 0) throw new Abbruch(`Seit v${aktuell} ist nichts gemergt.`);

  const { je, ohne } = labelUebersicht(prs);
  const ziel = wunsch ?? naechsteVersion(aktuell, prs);
  if (!versionHoeher(ziel, aktuell)) throw new Abbruch(`${ziel} ist nicht höher als ${aktuell}.`);
  const zaehlung = Object.entries(je).map(([l, n]) => `${l} ${String(n)}`).join(', ');
  u.schreiben(`Seit v${aktuell}: ${String(prs.length)} PRs (${zaehlung}).\n`);
  if (ohne.length > 0) u.schreiben(`Ohne Label, landen unter „Sonstiges“: ${ohne.map((n) => `#${String(n)}`).join(' ')} — vor dem Release nachtragen.\n`);
  u.schreiben(`Neue Version: ${ziel}${wunsch === undefined ? ' (aus den Labels; andere mit `npm run release:vorbereiten -- X.Y.Z`)' : ''}\n`);

  leakPruefung(u);

  u.schreiben(`\n▸ Versions-PR für ${ziel}\n`);
  const branch = `version-${ziel}`;
  muss(u, 'git', ['switch', '-c', branch]);
  npm(u, ['version', ziel, '--no-git-tag-version']);
  muss(u, 'git', ['add', 'package.json', 'package-lock.json']);
  muss(u, 'git', ['commit', '-q', '-m', `Version ${ziel}`]);
  muss(u, 'git', ['push', '-q', '-u', 'origin', branch]);
  muss(u, 'gh', ['pr', 'create', '--title', `Version ${ziel}`, '--label', 'ohne-notiz', '--body', `Release v${ziel}: danach \`npm run release\`.`]);
  const nr = u.aus('gh', ['pr', 'view', '--json', 'number', '-q', '.number']);

  u.schreiben(`\n▸ CI von #${nr}\n`);
  // Direkt nach dem Push meldet GitHub noch keine Checks, und `--watch` bricht dann sofort ab.
  const checksDa = (): boolean => {
    try {
      return !['', '[]'].includes(u.aus('gh', ['pr', 'checks', nr, '--json', 'name']));
    } catch {
      return false;
    }
  };
  for (let i = 0; i < 24 && !checksDa(); i++) await u.warten(5000);
  const gruen = u.lauf('gh', ['pr', 'checks', nr, '--watch', '--interval', '20']) === 0;
  muss(u, 'git', ['switch', '-q', 'main']);
  if (!gruen) throw new Abbruch(`CI von #${nr} ist nicht grün.`);
  u.schreiben(`\n#${nr} ist grün. Mergen (Squash), dann \`git pull --ff-only && npm run release\`.\n`);
}

async function ausloesen(u: Umgebung, version: string): Promise<void> {
  const laeufe = (): { databaseId: number }[] =>
    JSON.parse(u.aus('gh', ['run', 'list', '--workflow', 'release.yml', '--event', 'workflow_dispatch', '--limit', '10', '--json', 'databaseId'])) as {
      databaseId: number;
    }[];
  const vorher = new Set(laeufe().map((l) => l.databaseId));

  u.schreiben(`\n▸ Release-Workflow für v${version}\n`);
  muss(u, 'gh', ['workflow', 'run', 'release.yml', '--ref', 'main']);
  let id: number | null = null;
  for (let i = 0; i < 24 && id === null; i++) {
    await u.warten(5000);
    id = neuerLauf(vorher, laeufe());
  }
  if (id === null) throw new Abbruch('Der Lauf erscheint nicht — unter Actions → Release nachsehen.');
  if (u.lauf('gh', ['run', 'watch', String(id), '--exit-status', '--interval', '20']) !== 0) {
    throw new Abbruch(`Release-Lauf ${String(id)} ist rot — \`gh run view ${String(id)} --log-failed\`.`);
  }
}

function zipPruefen(u: Umgebung, version: string): void {
  u.schreiben('\n▸ ZIP, Prüfsumme, Attestation\n');
  const ordner = mkdtempSync(join(tmpdir(), 'scapio-release-'));
  try {
    muss(u, 'gh', ['release', 'download', `v${version}`, '--repo', REPO, '-p', 'Scapio.zip', '-p', 'SHA256SUMS', '-D', ordner]);
    const zip = join(ordner, 'Scapio.zip');
    const soll = pruefsummeAus(readFileSync(join(ordner, 'SHA256SUMS'), 'utf8'), 'Scapio.zip');
    const ist = createHash('sha256').update(readFileSync(zip)).digest('hex');
    if (soll !== ist) throw new Abbruch('SHA256SUMS passt nicht zu Scapio.zip.');
    u.schreiben('Prüfsumme stimmt.\n');
    if (u.aus('gh', ['repo', 'view', REPO, '--json', 'visibility', '-q', '.visibility']) === 'PUBLIC') {
      muss(u, 'gh', ['attestation', 'verify', zip, '--repo', REPO]);
    } else {
      u.schreiben('Repository privat — keine Attestation (ADR-047).\n');
    }
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
}

async function demo(u: Umgebung, version: string): Promise<void> {
  u.schreiben(`\n▸ Demo auf v${version}\n`);
  u.aus('git', ['fetch', '-q', '--tags', 'origin']);
  sauber(u);
  if (u.aus('git', ['rev-parse', 'HEAD']) !== u.aus('git', ['rev-parse', `v${version}^{commit}`])) {
    throw new Abbruch(`HEAD ist nicht v${version}. \`git switch --detach v${version}\`, dann \`npm run release -- --nur-demo\`.`);
  }
  npm(u, ['ci', '--ignore-scripts']);
  npm(u, ['run', 'demo:export']);
  npm(u, ['ci', '--ignore-scripts'], WORKER);
  npm(u, ['audit', '--audit-level=high'], WORKER);

  const token = await u.token();
  const wrangler = join(WORKER, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (u.lauf(process.execPath, [wrangler, 'deploy'], { cwd: WORKER, env: { ...process.env, CLOUDFLARE_API_TOKEN: token } }) !== 0) {
    throw new Abbruch(
      `Deploy fehlgeschlagen. Token abgelaufen? Unter macOS \`security delete-generic-password -s ${SCHLUESSEL.dienst}\`, dann \`npm run release -- --nur-demo\`.`,
    );
  }

  for (let i = 0; i < 6; i++) {
    if (healthVersion(await u.abrufen(`${DEMO_ADRESSE}/api/health`)) === version) {
      u.schreiben(`${DEMO_ADRESSE} meldet ${version}.\n`);
      return;
    }
    await u.warten(5000);
  }
  throw new Abbruch(`${DEMO_ADRESSE}/api/health meldet nicht ${version}.`);
}

async function release(u: Umgebung, nurDemo: boolean): Promise<void> {
  const version = paketVersion(u);
  if (!nurDemo) {
    aufMain(u);
    if (tagExistiert(u, version)) {
      throw new Abbruch(`v${version} gibt es schon — erst \`npm run release:vorbereiten\`; nur die Demo: \`npm run release -- --nur-demo\`.`);
    }
    leakPruefung(u);
    if (!(await u.frage(`\nRelease v${version} von ${u.aus('git', ['rev-parse', '--short', 'HEAD'])} auslösen?`))) throw new Abbruch('Nicht ausgelöst.');
    await ausloesen(u, version);
    zipPruefen(u, version);
  }
  await demo(u, version);
  u.schreiben(`\nv${version} ist draußen: https://github.com/${REPO}/releases/tag/v${version}\nVon Hand bleibt: Aktualisieren.command/.bat holt das neue ZIP.\n`);
}

/** 0 fertig, 1 abgebrochen; die Meldung steht dann in `schreiben`. */
export async function haupt(argumente: readonly string[], u: Umgebung): Promise<number> {
  try {
    if (argumente[0] === 'vorbereiten') {
      const wunsch = argumente[1];
      if (wunsch !== undefined && versionTeile(wunsch) === null) throw new Abbruch('Aufruf: npm run release:vorbereiten [-- X.Y.Z]');
      await vorbereiten(u, wunsch);
    } else {
      await release(u, argumente.includes('--nur-demo'));
    }
    return 0;
  } catch (fehler) {
    if (!(fehler instanceof Abbruch)) throw fehler;
    u.schreiben(`\n✗ ${fehler.message}\n`);
    return 1;
  }
}

// ── echte Umgebung ───────────────────────────────────────────────────────────────────────

/* v8 ignore start -- Terminal, Schlüsselbund und Netz; der Ablauf darüber ist getestet. */
function aus(befehl: string, argumente: readonly string[]): string {
  try {
    return execFileSync(befehl, argumente, { cwd: WURZEL, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (fehler) {
    const meldung = (fehler as { stderr?: string }).stderr?.trim() ?? String(fehler);
    throw new Abbruch(`${befehl} ${argumente.slice(0, 2).join(' ')}: ${meldung}`);
  }
}

function lauf(befehl: string, argumente: readonly string[], optionen: LaufOptionen = {}): number {
  const r = spawnSync(befehl, argumente, { cwd: optionen.cwd ?? WURZEL, env: optionen.env ?? process.env, stdio: 'inherit' });
  if (r.error !== undefined) throw r.error;
  return r.status ?? 1;
}

async function frage(text: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^(j|ja|y|yes)$/i.test((await rl.question(`${text} (j/n) `)).trim());
  } finally {
    rl.close();
  }
}

function verdeckt(text: string): Promise<string> {
  const ein = process.stdin;
  if (!ein.isTTY) return Promise.reject(new Abbruch('Die Token-Eingabe braucht ein Terminal.'));
  return new Promise((ok, fehler) => {
    let eingabe = '';
    const ende = (): void => {
      ein.off('data', lesen);
      ein.setRawMode(false);
      ein.pause();
      process.stdout.write('\n');
    };
    const lesen = (teil: string): void => {
      for (const z of teil) {
        if (z === '\r' || z === '\n' || z === '\u0003') {
          ende();
          if (z === '\u0003') fehler(new Abbruch('Abgebrochen.'));
          else ok(eingabe.trim());
          return;
        }
        eingabe = z === '\u007f' || z === '\b' ? eingabe.slice(0, -1) : eingabe + z;
      }
    };
    process.stdout.write(text);
    ein.setEncoding('utf8');
    ein.setRawMode(true);
    ein.resume();
    ein.on('data', lesen);
  });
}

async function token(): Promise<string> {
  const mac = process.platform === 'darwin';
  if (mac) {
    const gelesen = spawnSync('/usr/bin/security', ['find-generic-password', '-s', SCHLUESSEL.dienst, '-a', SCHLUESSEL.konto, '-w'], { encoding: 'utf8' });
    if (gelesen.status === 0 && tokenGueltig(gelesen.stdout.trim())) return gelesen.stdout.trim();
  }
  process.stdout.write('Cloudflare-API-Token mit genau „Workers Scripts: Edit“ auf dem Scapio-Konto.\n');
  const t = await verdeckt('Token: ');
  if (!tokenGueltig(t)) throw new Abbruch('Das sieht nicht nach einem Cloudflare-Token aus.');
  if (mac) {
    // Über stdin statt argv: so steht der Token nie in der Prozessliste.
    const r = spawnSync('/usr/bin/security', ['-i'], {
      input: `add-generic-password -U -s ${SCHLUESSEL.dienst} -a ${SCHLUESSEL.konto} -w ${t}\n`,
      stdio: ['pipe', 'ignore', 'inherit'],
    });
    process.stdout.write(r.status === 0 ? 'Im Schlüsselbund abgelegt.\n' : 'Nicht im Schlüsselbund abgelegt — beim nächsten Mal wieder eingeben.\n');
  }
  return t;
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  process.exitCode = await haupt(process.argv.slice(2), {
    aus,
    lauf,
    npmCli: process.env['npm_execpath'],
    paketJson: () => readFileSync(join(WURZEL, 'package.json'), 'utf8'),
    frage,
    token,
    abrufen: (adresse) =>
      fetch(adresse)
        .then((r) => r.json() as Promise<unknown>)
        .catch(() => null),
    warten: (ms) => warten(ms),
    schreiben: (text) => process.stdout.write(text),
  });
}
/* v8 ignore stop */
