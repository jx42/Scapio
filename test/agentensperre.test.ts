/**
 * ADR-042 als Konfiguration: die versionierte `deny`-Liste sperrt, was Depotwerte in eine
 * Agentensitzung bringen würde. [ADR-054]
 *
 * Geprüft wird gegen ein Modell der Claude-Code-Regeln, nicht gegen Claude Code selbst:
 * `*` steht für beliebigen Text, ein Befehl wird an `&&`, `||`, `;` und `|` geteilt und jeder
 * Teil einzeln verglichen, ` *` am Ende deckt auch den Befehl ohne Argument. Read-Muster mit
 * `~/` gelten ab dem Benutzerverzeichnis, mit `//` ab der Wurzel, sonst überall darunter.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const einstellungen = JSON.parse(readFileSync('.claude/settings.json', 'utf8')) as {
  permissions: { allow: string[]; deny: string[] };
};
const { allow, deny } = einstellungen.permissions;

const HOME = '/Users/nutzer';
const regeln = (art: string): string[] =>
  deny.filter((r) => r.startsWith(`${art}(`)).map((r) => r.slice(art.length + 1, -1));

const flucht = (text: string): string => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

function bashGesperrt(befehl: string): boolean {
  const muster = regeln('Bash').map((m) => {
    const kern = m.endsWith(' *') ? `${flucht(m.slice(0, -2)).replaceAll('*', '.*')}(?: .*)?` : flucht(m).replaceAll('*', '.*');
    return new RegExp(`^${kern}$`, 's');
  });
  return befehl
    .split(/&&|\|\||;|\|/)
    .map((teil) => teil.trim())
    .some((teil) => muster.some((m) => m.test(teil)));
}

function readGesperrt(pfad: string): boolean {
  const absolut = pfad.replace(/^~\//, `${HOME}/`);
  return regeln('Read').some((m) => {
    const basis = m.startsWith('~/') ? `${HOME}/${m.slice(2)}` : m.startsWith('//') ? m.slice(1) : `**/${m}`;
    const kern = flucht(basis)
      .replaceAll('**/', '\u0000')
      .replaceAll('**', '\u0001')
      .replaceAll('*', '[^/]*')
      .replaceAll('\u0000', '(?:.*/)?')
      .replaceAll('\u0001', '.*');
    return new RegExp(`^${kern.startsWith('(?:') ? '/?' : ''}${kern}$`).test(absolut);
  });
}

describe('Agentensperre [ADR-054]', () => {
  it.each([
    'npm start',
    'npm run start',
    'npm run -s start',
    'npm run start -- --port 5000',
    'npm run verify',
    'npm run verify --silent',
    'npm run -s verify',
    'npm run --silent verify -- x',
    'npm run ingest',
    'npm run -s ingest',
    'npm run dev',
    'npm run --silent dev',
    'npm run leak-pruefung',
    'npm run -s leak-pruefung',
    'node --experimental-strip-types start/verify.ts',
    'node start/nodeVersion.mjs && node --experimental-strip-types ingest/lauf.ts',
    'node --disable-warning=ExperimentalWarning --experimental-strip-types start/start.ts',
    './Start.command',
    'open Start.command',
    'bash ./Aktualisieren.command',
    'cmd /c Start.bat',
    'sqlite3 ~/x.db',
    'curl -s http://127.0.0.1:4732/api/kennzahlen',
    'wget -qO- localhost:4732',
    `node -e "fetch('http://127.0.0.1:4732/').then((r) => r.text()).then(console.log)"`,
    'cp "$HOME/Library/Application Support/scapio/portfolio.db" /tmp/x.db',
    'cat ~/Library/Application\\ Support/scapio/lauf.log',
    `python3 -c "import sqlite3; sqlite3.connect('${HOME}/Library/Application Support/scapio/portfolio.db')"`,
    'type %LOCALAPPDATA%\\scapio\\lauf.log',
    'ls ~/Scapio-Sicherung',
    'echo ok && npm run -s verify',
  ])('sperrt `%s`', (befehl) => {
    expect(bashGesperrt(befehl)).toBe(true);
  });

  it.each([
    'npm run verify:zaehlung',
    'npm run check:kurz',
    'npm run test -- test/ingest/lauf.test.ts',
    'npm run test -- test/start/verify.test.ts',
    'npx vitest run test/start/verify.test.ts',
    'grep -n haupt start/start.ts',
    'sed -n 1,20p start/verify.ts',
    'npm run demo',
    'npm run edgecases',
    'curl -s -o /dev/null http://127.0.0.1:4791/',
    'npm run pr-bild -- 42 verlauf',
    'git diff -- Start.command Start.bat',
  ])('lässt `%s` durch', (befehl) => {
    expect(bashGesperrt(befehl)).toBe(false);
  });

  it.each([
    '~/Library/Application Support/scapio/portfolio.db',
    '~/AppData/Local/scapio/mcp/token.json',
    '~/Scapio-Sicherung/portfolio-1-x.db',
    '/var/folders/ab/cd/T/portfolio-verify-x/portfolio-1-x.db',
    '/tmp/kopie.db-wal',
    '/irgendwo/lauf.log',
  ])('sperrt Read auf %s', (pfad) => {
    expect(readGesperrt(pfad)).toBe(true);
  });

  it('lässt Read auf das Projekt durch', () => {
    expect(readGesperrt('/Users/nutzer/Scapio/start/verify.ts')).toBe(false);
  });

  it('sperrt MCP und WebFetch auf die lokale Adresse', () => {
    expect(deny).toEqual(
      expect.arrayContaining(['mcp__claude_ai_Scalable_Capital__*', 'WebFetch(domain:127.0.0.1)', 'WebFetch(domain:localhost)']),
    );
  });

  it('sperrt Claude in Chrome nur auf dem App-Port, nicht auf Demo und Randfallseite', () => {
    // Ohne Port gälte die Regel für jeden Port des Hosts [ADR-054, Nachtrag 2026-11-06].
    expect(regeln('ClaudeInChromeDomain').sort()).toEqual(['127.0.0.1:4732', 'localhost:4732']);
  });

  it('erlaubt verify:zaehlung', () => {
    expect(allow).toContain('Bash(npm run verify:zaehlung)');
    expect(bashGesperrt('npm run verify:zaehlung')).toBe(false);
  });
});
