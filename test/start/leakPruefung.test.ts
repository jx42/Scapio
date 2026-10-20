/** Leak-Prüfung: findet Depotwerte im Repository und nennt sie nie [ADR-042]. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { testDatenbank } from '../../db/verbindung.ts';
import { berichtText, betragsFormen, durchsuche, sammleSuchbegriffe } from '../../start/leakPruefung.ts';

// Zusammengesetzt, damit die Leak-Prüfung diesen Testpfad nicht selbst als Befund meldet.
const HEIM = ['', 'Users', 'maxmuster'].join('/');
const verzeichnisse: string[] = [];
afterEach(() => {
  for (const v of verzeichnisse.splice(0)) rmSync(v, { recursive: true, force: true });
});

async function depot() {
  const datenpfad = mkdtempSync(join(tmpdir(), 'leak-test-'));
  verzeichnisse.push(datenpfad);
  mkdirSync(join(datenpfad, 'mcp'));
  writeFileSync(join(datenpfad, 'mcp', 'token.json'), JSON.stringify({ access_token: 'zzGeheimesTokenZz42' }));

  const db = await testDatenbank();
  db.prepare(`INSERT INTO bestand (isin, name, menge_e8, kurs_e6, stand) VALUES ('XX0000000001', 'A', 1234567800, 1, 'x')`).run();
  db.prepare(`INSERT INTO sparplan (isin, name, betrag_cent, frequenz, stand) VALUES ('XX0000000001', 'A', 123456, 'MONATLICH', 'x')`).run();
  db.prepare(`
    INSERT INTO transaktion (id, ts, tag, art, typ, betrag_cent, status, ist_extern, gesehen_am)
    VALUES ('tx-abcdef', 'x', '2021-03-04', 'WERTPAPIER', 'KAUF', 500000, 'x', 1, 'x')`).run();
  const begriffe = sammleSuchbegriffe(db, datenpfad, HEIM, 'maxmuster');
  db.close();
  return begriffe;
}

describe('betragsFormen', () => {
  it('kennt deutsche und englische Schreibweise', () => {
    expect(betragsFormen(123_456_78n)).toEqual(['123456,78', '123.456,78', '123456.78', '123,456.78', '12345678']);
  });
});

describe('Leak-Prüfung', () => {
  it('meldet krumme Werte als Befund, runde als Hinweis, und nennt keinen Wert', async () => {
    const begriffe = await depot();
    const ergebnis = durchsuche(
      [
        { rel: 'a.md', text: 'Sparrate 1.234,56 €\nStück 12,345678' },
        { rel: 'b.ts', text: "const id = 'tx-abcdef'; // seit 04.03.2021" },
        { rel: 'c.md', text: 'Einzahlung 5.000,00 €, ISIN XX0000000001' },
        { rel: 'd.md', text: `Token zzGeheimesTokenZz42 bei MaxMuster, ${HEIM}/x` },
        { rel: 'e.md', text: '11.234,567 und 31.234,56 sind andere Zahlen' },
      ],
      begriffe,
    );

    expect([...ergebnis.befunde.keys()].sort()).toEqual([
      'Benutzername',
      'Datum erster Kauf',
      'Depotwert/Betrag (krumm)',
      'Heimatverzeichnis',
      'MCP-Token/Client-Kennung',
      'Pfad /Users/…',
      'Stückzahl',
      'Transaktions-ID',
    ]);
    expect(ergebnis.befunde.get('Depotwert/Betrag (krumm)')).toEqual(['a.md:1']);
    expect(ergebnis.befunde.get('Stückzahl')).toEqual(['a.md:2']);
    expect([...ergebnis.hinweise.keys()]).toEqual(['Depotwert/Betrag (rund)']);
    expect(ergebnis.isinDateien.get(1)).toEqual(new Set(['c.md']));

    const text = berichtText(ergebnis, begriffe.isinNummer.size);
    expect(text).toContain('#1 in 1 Datei(en): c.md');
    expect(text).not.toMatch(/1\.?234,56|12,3456|5\.?000|XX0000000001|tx-abcdef|zzGeheim|maxmuster|04\.03\.2021/i);
  });

  it('ohne Treffer: keine Befunde', async () => {
    const ergebnis = durchsuche([{ rel: 'a.md', text: 'nichts hier, kontakt@example.org, git@github.com:jx42/Scapio' }], await depot());
    expect(ergebnis.befunde.size + ergebnis.hinweise.size + ergebnis.isinDateien.size).toBe(0);
    expect(berichtText(ergebnis, 1)).toContain('Keine Befunde.');
  });
});
