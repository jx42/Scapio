/**
 * Leak-Prüfung vor jedem Release (docs/ENTWICKLUNG.md#release, ADR-042).
 *
 * Liest Suchbegriffe aus der echten Datenbank und dem Datenverzeichnis und sucht sie in jeder
 * Datei, die `git ls-files` liefert. Ausgegeben werden nur Befundart, Datei und Zeile — nie
 * der gefundene Wert. Depot-ISINs erscheinen als Nummer (#1, #2 …), nicht im Klartext.
 *
 * `--datenpfad <ordner>` prüft gegen ein anderes Datenverzeichnis.
 *
 * Exit 0: nichts, was den Release aufhält. Exit 1: Befunde. Exit 2: Datenbank fehlt.
 * Runde Beträge und Depot-ISINs sind Hinweise: sie treffen oft zufällig (Testbeispiel,
 * Benchmark) und halten den Release nicht auf, gehören aber angesehen.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dbPfad, ladeKonfiguration, PROJEKTWURZEL } from '../shared/konfiguration.ts';

export type Nadel = { art: string; text: string; zahl?: boolean; grossKlein?: boolean; hinweis?: boolean };
export type Suchbegriffe = { nadeln: Nadel[]; isinNummer: Map<string, number> };
export type Befunde = { befunde: Map<string, string[]>; hinweise: Map<string, string[]>; isinDateien: Map<number, Set<string>> };

const MINDESTBETRAG = 100_000n; // 1.000 €: kleinere Beträge treffen zu oft zufällig.

export function betragsFormen(cent: bigint): string[] {
  const c = cent < 0n ? -cent : cent;
  const euro = (c / 100n).toString();
  const rest = (c % 100n).toString().padStart(2, '0');
  const tausender = (s: string, trenner: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, trenner);
  const formen = [`${euro},${rest}`, `${tausender(euro, '.')},${rest}`, `${euro}.${rest}`, `${tausender(euro, ',')}.${rest}`];
  if (c.toString().length >= 6) formen.push(c.toString());
  return [...new Set(formen)];
}

function sammleIds(wert: unknown, ziel: Set<string>, schluessel = ''): void {
  if (Array.isArray(wert)) for (const w of wert) sammleIds(w, ziel, schluessel);
  else if (wert !== null && typeof wert === 'object') {
    for (const [s, w] of Object.entries(wert)) sammleIds(w, ziel, s);
  } else if ((typeof wert === 'string' || typeof wert === 'number') && /id$/i.test(schluessel)) {
    const t = String(wert);
    if (t.length >= 6) ziel.add(t);
  }
}

function sammleStrings(wert: unknown, ziel: Set<string>): void {
  if (Array.isArray(wert)) for (const w of wert) sammleStrings(w, ziel);
  else if (wert !== null && typeof wert === 'object') for (const w of Object.values(wert)) sammleStrings(w, ziel);
  else if (typeof wert === 'string' && wert.length >= 16 && !/^https?:\/\//.test(wert)) ziel.add(wert);
}

export function sammleSuchbegriffe(db: DatabaseSync, datenpfad: string, heim: string, benutzer: string): Suchbegriffe {
  const zeilen = <T>(sql: string): T[] => db.prepare(sql).all() as T[];
  const nadeln: Nadel[] = [];
  const isinNummer = new Map<string, number>();

  for (const { isin } of zeilen<{ isin: string }>(`
    SELECT isin FROM transaktion WHERE isin IS NOT NULL
    UNION SELECT bezug_isin FROM transaktion WHERE bezug_isin IS NOT NULL
    UNION SELECT isin FROM bestand WHERE isin <> 'CASH'
    UNION SELECT isin FROM sparplan ORDER BY 1`)) {
    isinNummer.set(isin, isinNummer.size + 1);
  }

  for (const { id } of zeilen<{ id: string }>('SELECT id FROM transaktion')) {
    if (id.length >= 6) nadeln.push({ art: 'Transaktions-ID', text: id });
  }

  const kennungen = new Set<string>();
  for (const { payload_json } of zeilen<{ payload_json: string }>(`
    SELECT payload_json FROM raw_snapshot
    WHERE quelle IN ('holdings','transaktionen','cash','gesamtwert','sparplaene')`)) {
    try {
      sammleIds(JSON.parse(payload_json), kennungen);
    } catch {
      /* kaputter Schnappschuss: übergehen */
    }
  }
  for (const t of kennungen) nadeln.push({ art: 'Kennung aus Bankantwort', text: t });

  const betraege = new Set<bigint>();
  for (const r of zeilen<Record<string, number | bigint>>(`
    SELECT gesamt_cent, wertpapiere_cent, cash_cent, netto_einzahlung_kum_cent FROM depot_tag
    WHERE tag = (SELECT MAX(tag) FROM depot_tag)
       OR gesamt_cent = (SELECT MAX(gesamt_cent) FROM depot_tag)`)) {
    for (const w of Object.values(r)) betraege.add(BigInt(w));
  }
  for (const { betrag_cent } of zeilen<{ betrag_cent: number | bigint }>(
    'SELECT DISTINCT betrag_cent FROM transaktion WHERE ist_extern = 1',
  )) {
    betraege.add(BigInt(betrag_cent));
  }
  for (const { betrag_cent } of zeilen<{ betrag_cent: number | bigint }>('SELECT betrag_cent FROM sparplan')) {
    betraege.add(BigInt(betrag_cent));
  }
  for (const b of betraege) {
    if ((b < 0n ? -b : b) < MINDESTBETRAG) continue;
    // Ein Vielfaches von 100 € trifft eher zufällig auf ein Testbeispiel als ein krummer Betrag.
    const rund = b % 10_000n === 0n;
    const art = rund ? 'Depotwert/Betrag (rund)' : 'Depotwert/Betrag (krumm)';
    for (const f of betragsFormen(b)) nadeln.push({ art, text: f, zahl: true, hinweis: rund });
  }
  // Stückzahlen mit mindestens drei Nachkommastellen sind praktisch eindeutig.
  for (const { menge_e8 } of zeilen<{ menge_e8: number | bigint }>('SELECT menge_e8 FROM bestand')) {
    const m = BigInt(menge_e8);
    const ganz = (m / 100_000_000n).toString();
    const nach = (m % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
    if (nach.length < 3) continue;
    nadeln.push({ art: 'Stückzahl', text: `${ganz},${nach}`, zahl: true }, { art: 'Stückzahl', text: `${ganz}.${nach}`, zahl: true });
  }

  const [erster] = zeilen<{ tag: string | null }>(`SELECT MIN(tag) AS tag FROM transaktion WHERE art = 'WERTPAPIER'`);
  if (erster?.tag) {
    const [j, m, t] = erster.tag.split('-');
    nadeln.push({ art: 'Datum erster Kauf', text: erster.tag }, { art: 'Datum erster Kauf', text: `${t}.${m}.${j}` });
  }

  const geheimnisse = new Set<string>();
  const mcpOrdner = join(datenpfad, 'mcp');
  if (existsSync(mcpOrdner)) {
    for (const name of readdirSync(mcpOrdner)) {
      const pfad = join(mcpOrdner, name);
      if (!statSync(pfad).isFile()) continue;
      try {
        sammleStrings(JSON.parse(readFileSync(pfad, 'utf8')), geheimnisse);
      } catch {
        /* keine JSON-Datei */
      }
    }
  }
  for (const g of geheimnisse) nadeln.push({ art: 'MCP-Token/Client-Kennung', text: g });

  nadeln.push({ art: 'Heimatverzeichnis', text: heim });
  nadeln.push({ art: 'Datenverzeichnis', text: datenpfad });
  if (benutzer.length >= 3) nadeln.push({ art: 'Benutzername', text: benutzer, grossKlein: true });

  return { nadeln, isinNummer };
}

const MUSTER: { art: string; re: RegExp; ausser?: RegExp }[] = [
  { art: 'Pfad /Users/…', re: /\/Users\/[A-Za-z0-9._-]+/g, ausser: /\/Users\/(…|\.\.\.|<[^>]*>|name|nutzer|du|you|runner|example)\b/i },
  { art: 'Pfad C:\\Users\\…', re: /[A-Za-z]:\\{1,2}Users\\{1,2}[A-Za-z0-9._-]+/gi, ausser: /Users\\{1,2}(name|nutzer|runneradmin|test|<)/i },
  { art: 'Pfad /home/…', re: /\/home\/[A-Za-z0-9._-]+/g, ausser: /\/home\/(runner|user|node|nutzer)\b/ },
  { art: 'JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g },
  { art: 'GitHub-Token', re: /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g },
  { art: 'API-Schlüssel', re: /\b(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})/g },
  { art: 'Privater Schlüssel', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { art: 'Bearer-Token', re: /Bearer\s+[A-Za-z0-9._~+/-]{20,}=*/g, ausser: /geheim/ },
  {
    art: 'E-Mail',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
    ausser: /noreply|no-reply|@example\.|@users\.noreply\.github\.com|@anthropic\.com/i,
  },
];

const istZiffer = (c: string | undefined) => c !== undefined && /[0-9]/.test(c);

export function durchsuche(dateien: { rel: string; text: string }[], { nadeln, isinNummer }: Suchbegriffe): Befunde {
  const befunde = new Map<string, string[]>();
  const hinweise = new Map<string, string[]>();
  const isinDateien = new Map<number, Set<string>>();
  const melde = (ziel: Map<string, string[]>, art: string, ort: string) => {
    const liste = ziel.get(art) ?? [];
    if (!liste.includes(ort)) liste.push(ort);
    ziel.set(art, liste);
  };

  for (const { rel, text } of dateien) {
    const kleinText = text.toLowerCase();
    const zeileVon = (pos: number) => text.slice(0, pos).split('\n').length;

    for (const n of nadeln) {
      const heu = n.grossKlein ? kleinText : text;
      const such = n.grossKlein ? n.text.toLowerCase() : n.text;
      for (let pos = heu.indexOf(such); pos !== -1; pos = heu.indexOf(such, pos + 1)) {
        if (n.zahl) {
          const vor = heu[pos - 1];
          const nach = heu[pos + such.length];
          if (istZiffer(vor) || ((vor === '.' || vor === ',') && istZiffer(heu[pos - 2]))) continue;
          if (istZiffer(nach) || ((nach === '.' || nach === ',') && istZiffer(heu[pos + such.length + 1]))) continue;
        }
        if (n.grossKlein && (/[a-z0-9]/.test(heu[pos - 1] ?? '') || /[a-z0-9]/.test(heu[pos + such.length] ?? ''))) continue;
        melde(n.hinweis ? hinweise : befunde, n.art, `${rel}:${String(zeileVon(pos))}`);
      }
    }

    for (const [isin, nr] of isinNummer) {
      if (!text.includes(isin)) continue;
      const s = isinDateien.get(nr) ?? new Set();
      s.add(rel);
      isinDateien.set(nr, s);
    }

    for (const { art, re, ausser } of MUSTER) {
      for (const treffer of text.matchAll(re)) {
        if (ausser?.test(treffer[0])) continue;
        melde(befunde, art, `${rel}:${String(zeileVon(treffer.index))}`);
      }
    }
  }
  return { befunde, hinweise, isinDateien };
}

export function berichtText({ befunde, hinweise, isinDateien }: Befunde, isinAnzahl: number): string {
  const zeilen: string[] = [];
  const liste = (titel: string, m: Map<string, string[]>) => {
    if (m.size === 0) return;
    zeilen.push(titel);
    for (const [art, orte] of [...m].sort()) {
      zeilen.push(`${art} — ${String(orte.length)} Fundstelle(n)`);
      for (const o of orte.slice(0, 25)) zeilen.push(`  ${o}`);
      if (orte.length > 25) zeilen.push(`  … und ${String(orte.length - 25)} weitere`);
    }
    zeilen.push('');
  };
  liste('BEFUNDE', befunde);
  liste('HINWEISE (ansehen, halten den Release nicht auf)', hinweise);

  if (isinDateien.size > 0) {
    zeilen.push('Depot-ISINs im Repository (seltene zuerst; eine Benchmark- oder Beispiel-ISIN ist kein Leak,');
    zeilen.push('ein Satz seltener ISINs zusammen schon):');
    for (const [nr, s] of [...isinDateien].sort((a, b) => a[1].size - b[1].size)) {
      const d = [...s];
      zeilen.push(`  #${String(nr)} in ${String(d.length)} Datei(en): ${d.slice(0, 6).join(', ')}${d.length > 6 ? ', …' : ''}`);
    }
    zeilen.push(`  ${String(isinAnzahl - isinDateien.size)} von ${String(isinAnzahl)} Depot-ISINs kommen nirgends vor.`, '');
  }

  zeilen.push(befunde.size === 0 ? 'Keine Befunde.' : 'Befunde oben beheben, dann erneut prüfen.');
  zeilen.push('Die Ausgabe enthält keine Werte und darf in die Agentensitzung.');
  return zeilen.join('\n');
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  const schalter = process.argv.indexOf('--datenpfad');
  const k = ladeKonfiguration();
  const datenpfad = schalter === -1 ? k.datenpfad : resolve(process.argv[schalter + 1] ?? '');
  const datei = dbPfad({ ...k, datenpfad });
  if (!existsSync(datei)) {
    process.stderr.write('Keine Datenbank unter dem Datenverzeichnis — erst einen Lauf machen.\n');
    process.exit(2);
  }
  const db = new DatabaseSync(datei, { readOnly: true });
  const begriffe = sammleSuchbegriffe(db, datenpfad, homedir(), userInfo().username);
  db.close();

  const rels = execFileSync('git', ['ls-files', '-z'], { cwd: PROJEKTWURZEL, encoding: 'utf8' }).split('\0').filter(Boolean);
  const dateien: { rel: string; text: string }[] = [];
  let binaer = 0;
  for (const rel of rels) {
    const pfad = join(PROJEKTWURZEL, rel);
    if (!existsSync(pfad)) continue;
    const roh = readFileSync(pfad);
    if (roh.includes(0)) binaer++;
    else dateien.push({ rel, text: roh.toString('utf8') });
  }

  const ergebnis = durchsuche(dateien, begriffe);
  process.stdout.write(`Geprüft: ${String(rels.length)} Dateien aus git ls-files (${String(binaer)} binär übersprungen).\n`);
  process.stdout.write(`Suchbegriffe: ${String(begriffe.isinNummer.size)} Depot-ISINs, ${String(begriffe.nadeln.length)} weitere.\n\n`);
  process.stdout.write(`${berichtText(ergebnis, begriffe.isinNummer.size)}\n`);
  process.exit(ergebnis.befunde.size === 0 ? 0 : 1);
}
