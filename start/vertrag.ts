/**
 * `npm run vertrag` — Vertragspruefung gegen den echten MCP-Server. Von Hand gestartet,
 * nie automatisch: sie ruft die Bank.
 *
 * Der Zweck ist eine einzige Frage: Passen die zod-Schemata in `ingest/schema.ts` noch
 * zu dem, was Scalable tatsaechlich schickt? Ein umbenanntes Feld faellt sonst erst auf,
 * wenn ein Lauf scheitert — oder schlimmer, wenn er nicht scheitert und still weniger
 * importiert.
 *
 * Ausgegeben werden ausschliesslich FELDNAMEN und Pfade — niemals Werte. Die Werte sind
 * Kontostaende, Stueckzahlen und Kurse; sie gehoeren in die Datenbank und sonst
 * nirgendwohin, schon gar nicht in ein Terminalprotokoll, das kopiert wird.
 *
 * Aufgerufen werden ausschliesslich lesende Tools — die Allowlist steht als Union-Typ in
 * `ingest/mcp.ts`. [INV-01]
 */

import { resolve } from 'node:path';
import type { z } from 'zod';
import { ladeKonfiguration } from '../shared/konfiguration.ts';
import { oeffneDatenbank } from '../db/verbindung.ts';
import * as repository from '../db/repository/index.ts';
import type { LesendesTool } from '../ingest/mcp.ts';
import { mcpAufrufRoh } from '../ingest/mcp.ts';
import {
  CashBreakdownAntwort,
  ChartAntwort,
  HoldingsAntwort,
  OverviewAntwort,
  SparplaeneAntwort,
  TransaktionenAntwort,
  Wertpapierantwort,
} from '../ingest/schema.ts';

type Pruefling = {
  readonly name: string;
  readonly tool: LesendesTool;
  readonly schema: z.ZodTypeAny;
  /** Braucht das Tool eine ISIN? Dann wird eine aus der Datenbank genommen. */
  readonly brauchtIsin?: boolean;
};

const PRUEFLINGE: readonly Pruefling[] = [
  { name: 'holdings', tool: 'mcp__claude_ai_Scalable_Capital__get_portfolio_holdings', schema: HoldingsAntwort },
  {
    name: 'transaktionen',
    tool: 'mcp__claude_ai_Scalable_Capital__list_portfolio_transactions',
    schema: TransaktionenAntwort,
  },
  {
    name: 'kurse',
    tool: 'mcp__claude_ai_Scalable_Capital__get_security_chart',
    schema: ChartAntwort,
    brauchtIsin: true,
  },
  {
    name: 'art',
    tool: 'mcp__claude_ai_Scalable_Capital__get_security_quote',
    schema: Wertpapierantwort,
    brauchtIsin: true,
  },
  { name: 'sparplaene', tool: 'mcp__claude_ai_Scalable_Capital__list_savings_plans', schema: SparplaeneAntwort },
  {
    name: 'cash',
    tool: 'mcp__claude_ai_Scalable_Capital__get_portfolio_cash_breakdown',
    schema: CashBreakdownAntwort,
  },
  { name: 'gesamtwert', tool: 'mcp__claude_ai_Scalable_Capital__get_portfolio_overview', schema: OverviewAntwort },
];

/**
 * Feldnamen sind Fremdtext. Sie werden ausgegeben — das ist der Sinn der Pruefung —
 * aber nur als druckbares ASCII und gekuerzt, damit kein Steuerzeichen das Terminal
 * verstellt. [INV-06 im Geiste: fremder Text wird nie ausgewertet]
 */
function harmlos(text: string): string {
  return [...text.slice(0, 60)].map((z) => (z >= ' ' && z <= '~' ? z : '.')).join('');
}

function pfadText(pfad: readonly (string | number)[]): string {
  return pfad.length === 0 ? '(Wurzel)' : harmlos(pfad.map(String).join('.'));
}

type Befund = {
  readonly unbekannt: Set<string>;
  readonly fehlend: Set<string>;
  readonly andersartig: Set<string>;
};

function leererBefund(): Befund {
  return { unbekannt: new Set(), fehlend: new Set(), andersartig: new Set() };
}

/**
 * Wertet NUR die Struktur der zod-Befunde aus. `issue.message` wird bewusst nicht
 * ausgegeben: manche zod-Meldungen enthalten den empfangenen Wert.
 */
function sammle(schema: z.ZodTypeAny, block: unknown, befund: Befund): boolean {
  const ergebnis = schema.safeParse(block);
  if (ergebnis.success) return true;

  for (const problem of ergebnis.error.issues) {
    const stelle = pfadText(problem.path);
    if (problem.code === 'unrecognized_keys') {
      for (const schluessel of problem.keys) {
        befund.unbekannt.add(stelle === '(Wurzel)' ? harmlos(schluessel) : `${stelle}.${harmlos(schluessel)}`);
      }
    } else if (problem.code === 'invalid_type' && problem.received === 'undefined') {
      befund.fehlend.add(stelle);
    } else {
      befund.andersartig.add(`${stelle} [${problem.code}]`);
    }
  }
  return false;
}

export async function haupt(): Promise<number> {
  const konfiguration = ladeKonfiguration();
  const db = await oeffneDatenbank({ konfiguration, migrieren: false });

  let isin: string | null = null;
  try {
    isin = repository.kurs.isins(db)[0] ?? repository.bestand.alle(db)[0]?.isin ?? null;
  } finally {
    db.close();
  }

  process.stdout.write('Vertragspruefung gegen den Scalable-MCP. Es werden nur Feldnamen ausgegeben.\n\n');

  let abweichungen = 0;

  for (const p of PRUEFLINGE) {
    if (p.brauchtIsin === true && isin === null) {
      process.stdout.write(`${p.name.padEnd(14)} uebersprungen — keine ISIN in der Datenbank.\n`);
      continue;
    }

    let bloecke: readonly unknown[];
    try {
      const antwort = await mcpAufrufRoh(p.tool, {
        konfiguration,
        ...(p.brauchtIsin === true && isin !== null ? { ergaenzung: { isin, fenster: 'one_month' as const } } : {}),
      });
      bloecke = antwort.bloecke;
    } catch (fehler) {
      process.stdout.write(`${p.name.padEnd(14)} FEHLER beim Abruf: ${(fehler as Error).message}\n`);
      abweichungen += 1;
      continue;
    }

    const befund = leererBefund();
    let inOrdnung = bloecke.length > 0;
    for (const block of bloecke) {
      if (!sammle(p.schema, block, befund)) inOrdnung = false;
    }

    if (inOrdnung) {
      process.stdout.write(`${p.name.padEnd(14)} passt (${bloecke.length} Block/Bloecke).\n`);
      continue;
    }

    abweichungen += 1;
    process.stdout.write(`${p.name.padEnd(14)} weicht ab:\n`);
    if (bloecke.length === 0) process.stdout.write('    kein tool_result-Block in der Antwort\n');
    for (const feld of [...befund.unbekannt].sort()) process.stdout.write(`    unbekannt: ${feld}\n`);
    for (const feld of [...befund.fehlend].sort()) process.stdout.write(`    fehlt:     ${feld}\n`);
    for (const feld of [...befund.andersartig].sort()) process.stdout.write(`    anders:    ${feld}\n`);
  }

  process.stdout.write(
    abweichungen === 0
      ? '\nAlle Schemata passen zur echten Antwort.\n'
      : `\n${abweichungen} Quelle(n) weichen ab. Passe ingest/schema.ts an, bevor der naechste Lauf laeuft.\n`,
  );

  return abweichungen === 0 ? 0 : 1;
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  process.exitCode = await haupt();
}
