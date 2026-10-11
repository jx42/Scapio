/**
 * `npm run deinstallieren` — die Stellen, an denen ein Fehler nicht rueckgaengig zu machen
 * ist: ein fremder Ordner, ein Tippfehler bei der Bestaetigung, ein laufendes Dashboard.
 * Alles gegen ein temporaeres Datenverzeichnis. [ADR-049]
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BESTAETIGUNG,
  bekannteEintraege,
  deinstalliere,
  pruefeDatenordner,
  restschritte,
} from '../../start/deinstallieren.ts';
import { oeffneDatenbank } from '../../db/verbindung.ts';
import { vorgaben, type Konfiguration } from '../../shared/konfiguration.ts';

let wurzel: string;
let k: Konfiguration;

beforeEach(() => {
  wurzel = mkdtempSync(join(tmpdir(), 'scapio-deinstallieren-'));
  // Port 1: dort hoert in keiner Testumgebung jemand, `portBelegt` sagt "frei".
  k = { ...vorgaben(), port: 1, datenpfad: join(wurzel, 'scapio') };
});

afterEach(() => {
  rmSync(wurzel, { recursive: true, force: true });
});

function datenordnerMitAllem(): void {
  mkdirSync(join(k.datenpfad, 'mcp'), { recursive: true });
  mkdirSync(join(k.datenpfad, 'sicherung'), { recursive: true });
  writeFileSync(join(k.datenpfad, 'mcp', 'token.json'), '{}');
  writeFileSync(join(k.datenpfad, 'einstellungen.json'), '{}');
  writeFileSync(join(k.datenpfad, 'lauf.log'), 'x');
}

function lauf(antworten: readonly string[]) {
  const offen = [...antworten];
  const ausgabe: string[] = [];
  const fehler: string[] = [];
  return {
    ausgabe,
    fehler,
    umgebung: {
      konfiguration: k,
      frage: (text: string) => {
        ausgabe.push(text);
        return Promise.resolve(offen.shift() ?? '');
      },
      sage: (text: string) => ausgabe.push(text),
      scheitere: (text: string) => fehler.push(text),
      sicherungsZiel: join(wurzel, 'abschied'),
    },
  };
}

describe('pruefeDatenordner [ADR-049]', () => {
  it('erkennt einen fehlenden Ordner', () => {
    expect(pruefeDatenordner(k.datenpfad, bekannteEintraege(k))).toEqual({ art: 'fehlt' });
  });

  it('nimmt alles an, was Scapio selbst anlegt', () => {
    datenordnerMitAllem();
    writeFileSync(join(k.datenpfad, 'portfolio.db'), 'x');
    writeFileSync(join(k.datenpfad, 'portfolio.db-wal'), 'x');
    writeFileSync(join(k.datenpfad, '.DS_Store'), 'x');
    const befund = pruefeDatenordner(k.datenpfad, bekannteEintraege(k));
    expect(befund.art).toBe('ok');
  });

  it('verweigert einen Ordner mit einem einzigen fremden Eintrag', () => {
    datenordnerMitAllem();
    writeFileSync(join(k.datenpfad, 'Steuererklaerung.pdf'), 'x');
    expect(pruefeDatenordner(k.datenpfad, bekannteEintraege(k))).toEqual({
      art: 'fremd',
      eintraege: ['Steuererklaerung.pdf'],
    });
  });

  it('verweigert eine Verknuepfung statt eines Ordners', () => {
    const ziel = join(wurzel, 'woanders');
    mkdirSync(ziel);
    symlinkSync(ziel, k.datenpfad, 'junction');
    expect(pruefeDatenordner(k.datenpfad, bekannteEintraege(k)).art).toBe('kein-ordner');
  });
});

describe('deinstalliere [ADR-049]', () => {
  it('loescht erst nach der woertlichen Bestaetigung', async () => {
    datenordnerMitAllem();
    const { umgebung } = lauf([BESTAETIGUNG]);
    expect(await deinstalliere(umgebung)).toBe(true);
    expect(existsSync(k.datenpfad)).toBe(false);
  });

  it('loescht bei jeder anderen Antwort nichts', async () => {
    for (const antwort of ['', 'ja', 'entfernen ', 'ENTFERNE']) {
      datenordnerMitAllem();
      const { umgebung } = lauf([antwort]);
      expect(await deinstalliere(umgebung)).toBe(false);
      expect(existsSync(join(k.datenpfad, 'mcp', 'token.json'))).toBe(true);
    }
  });

  it('legt auf Wunsch vorher eine Sicherung ausserhalb des Datenordners an', async () => {
    (await oeffneDatenbank({ konfiguration: k })).close();
    const { umgebung, fehler } = lauf(['j', BESTAETIGUNG]);
    expect(await deinstalliere(umgebung)).toBe(true);
    expect(fehler).toEqual([]);
    expect(existsSync(k.datenpfad)).toBe(false);
    expect(readdirSync(join(wurzel, 'abschied')).filter((d) => d.endsWith('.db'))).toHaveLength(1);
  }, 30_000); // Migriert eine Datei und sichert sie; unter Windows dauert das Sekunden.

  it('fragt nicht nach einer Sicherung, wenn es keine Datenbank gibt', async () => {
    datenordnerMitAllem();
    const { umgebung, ausgabe } = lauf([BESTAETIGUNG]);
    await deinstalliere(umgebung);
    expect(ausgabe.some((z) => z.includes('[j/N]'))).toBe(false);
  });

  it('loescht nichts in einem fremden Ordner und fragt gar nicht erst', async () => {
    datenordnerMitAllem();
    writeFileSync(join(k.datenpfad, 'fremd.txt'), 'x');
    const { umgebung, ausgabe, fehler } = lauf([BESTAETIGUNG]);
    expect(await deinstalliere(umgebung)).toBe(false);
    expect(existsSync(join(k.datenpfad, 'fremd.txt'))).toBe(true);
    expect(ausgabe.some((z) => z.includes(BESTAETIGUNG))).toBe(false);
    expect(fehler.join('\n')).toContain('fremd.txt');
  });

  it('bricht ab, solange das Dashboard laeuft', async () => {
    datenordnerMitAllem();
    const server = createServer();
    await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
    try {
      k = { ...k, port: (server.address() as AddressInfo).port };
      const { umgebung } = lauf([BESTAETIGUNG]);
      expect(await deinstalliere(umgebung)).toBe(false);
      expect(existsSync(k.datenpfad)).toBe(true);
    } finally {
      await new Promise<void>((fertig) => server.close(() => fertig()));
    }
  });

  it('meldet einen fehlenden Ordner als erledigt', async () => {
    const { umgebung } = lauf([]);
    expect(await deinstalliere(umgebung)).toBe(true);
  });
});

describe('restschritte', () => {
  it('nennt MCP-Zugriff und Projektordner auf beiden Plattformen', () => {
    for (const plattform of ['darwin', 'win32'] as const) {
      const text = restschritte(plattform);
      expect(text).toContain('MCP-Zugriff');
      expect(text).toContain('Scapio-Ordner');
    }
  });
});
