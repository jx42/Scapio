/**
 * INV-01 — Der Ingest ruft ausschliesslich lesende MCP-Tools auf.
 *
 * Diese Anwendung ist ein Beobachter, kein Akteur. `submit_buy_order`,
 * `submit_sell_order`, `remove_savings_plan` und ihre Verwandten existieren fuer sie
 * nicht — auch dann nicht, wenn es gerade praktisch waere. Der Test prueft das nicht
 * nur als Absicht im Quelltext, sondern auch am tatsaechlichen Verhalten: `mcpAufrufRoh`
 * lehnt ein fremdes Tool ab, bevor es Konfiguration laedt oder ein Netzwerk beruehrt
 * [ADR-010], und die `ingest/mcp*.ts` reden mit genau einer Gegenstelle.
 */

import { describe, expect, it } from 'vitest';
import { LESENDE_TOOLS, mcpAufrufRoh } from '../../ingest/mcp.ts';
import type { LesendesTool } from '../../ingest/mcp.ts';
import { konfigurationFuer } from '../../shared/konfiguration.ts';
import { AUSGELIEFERT, alsListe, dateien, suche, sucheImCode } from './quellen.ts';

const QUELLEN = dateien(AUSGELIEFERT);

/**
 * Was ein Tool zu einem handelnden macht, ist sein Verb. Die Liste ist bewusst
 * grosszuegig: lieber ein lesendes Tool faelschlich abgelehnt als ein handelndes
 * durchgelassen.
 */
const HANDELNDE_VERBEN = /(submit|cancel|create|remove|add|upsert|delete|update|preview)_/;

describe('INV-01 — nur lesende Tools', () => {
  it('fuehrt in der Allowlist kein handelndes Tool', () => {
    const handelnd = LESENDE_TOOLS.filter((t) => HANDELNDE_VERBEN.test(t));
    expect(handelnd, `Handelndes Tool in der Allowlist: ${handelnd.join(', ')}`).toEqual([]);
  });

  it('nennt jedes Tool der Allowlist mit lesendem Verb', () => {
    // Positivliste: ein neues Verb (`set_`, `place_`) faellt hier durch, auch wenn es in
    // HANDELNDE_VERBEN fehlt. Ohne `mcp__`-Praefix [ADR-054].
    for (const tool of LESENDE_TOOLS) {
      expect(tool).toMatch(/^(get|list)_[a-z_]+$/);
    }
  });

  it('erwaehnt kein handelndes Tool irgendwo im ausgelieferten Quelltext', () => {
    const treffer = suche(
      QUELLEN,
      /(mcp__[A-Za-z0-9_]*__|')(submit|cancel|create|remove|add|upsert|delete|update|preview)_[a-z_]+/,
    );
    expect(treffer, `Handelndes Tool im Quelltext:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('nennt die verbotenen Tools namentlich nirgends', () => {
    const verboten = [
      'submit_buy_order',
      'submit_sell_order',
      'submit_savings_plan',
      'remove_savings_plan',
      'cancel_order',
      'create_price_alert',
    ];
    for (const name of verboten) {
      const treffer = suche(QUELLEN, new RegExp(name));
      expect(treffer, `${name} kommt vor:\n${alsListe(treffer)}`).toEqual([]);
    }
  });

  it('kennt kein Tool ausserhalb der Allowlist', () => {
    // Toolnamen stehen als Literal in einfachen Anfuehrungszeichen; Kommentare nennen sie in
    // Backticks und zaehlen nicht.
    const erlaubt = new Set<string>(LESENDE_TOOLS);
    const gefunden = new Set<string>();
    for (const q of QUELLEN) {
      for (const t of q.inhalt.match(/'(get|list)_[a-z_]+'/g) ?? []) gefunden.add(t.slice(1, -1));
    }
    const fremd = [...gefunden].filter((t) => !erlaubt.has(t));
    expect(fremd, `Tool ausserhalb der Allowlist: ${fremd.join(', ')}`).toEqual([]);
    expect(gefunden.size).toBeGreaterThan(0);
  });

  it('fuehrt keinen Toolnamen mit Claude-Code-Praefix [ADR-054]', () => {
    const treffer = suche(QUELLEN, /mcp__/);
    expect(treffer, `mcp__ im Quelltext:\n${alsListe(treffer)}`).toEqual([]);
  });
});

describe('INV-01 — die Laufzeitsperre vor jedem MCP-Aufruf', () => {
  // Kein echtes Tool — steht bewusst nicht in LESENDE_TOOLS. Der Typ verbietet das beim
  // Kompilieren; der `as`-Wurf simuliert, was andernorts ein Programmierfehler waere.
  const FREMDES_TOOL = 'submit_buy_order' as LesendesTool;

  // Zeigt absichtlich auf ein nicht vorhandenes Datenverzeichnis: selbst wenn die
  // Allowlist-Pruefung in `mcpAufrufRoh` einmal wegfiele, faende `zugriffstoken` hier
  // keinen Token und wuerde nie tatsaechlich das Netzwerk erreichen.
  const OHNE_TOKEN = konfigurationFuer('/nicht-vorhanden-fuer-inv-01-test', { port: 4732, erlaubteHosts: [] });

  it('lehnt ein Tool ausserhalb der Allowlist ab, bevor Konfiguration oder Netzwerk beruehrt werden', async () => {
    await expect(mcpAufrufRoh(FREMDES_TOOL, { konfiguration: OHNE_TOKEN })).rejects.toMatchObject({
      name: 'McpFehler',
      code: 'E_MCP_ARGUMENT',
    });
  });

  it('erzwingt die Allowlist zur Laufzeit, nicht nur ueber den Typ', () => {
    const treffer = sucheImCode(QUELLEN, /LESENDE_TOOLS\.includes\(/);
    expect(treffer.length, 'Kein Laufzeit-Check der Allowlist im Quelltext gefunden').toBeGreaterThan(0);
  });
});

describe('INV-01 — genau eine MCP-Gegenstelle', () => {
  const MCP_QUELLEN = QUELLEN.filter((q) => /^ingest\/mcp[A-Za-z]*\.ts$/.test(q.pfad));

  it('kennt nur den Scalable-Server als https-Adresse', () => {
    const fremd = suche(MCP_QUELLEN, /https:\/\/(?!mcp\.scalable\.capital)/);
    expect(fremd, `Fremde Gegenstelle im MCP-Client:\n${alsListe(fremd)}`).toEqual([]);
    // Und die eigene Adresse taucht tatsaechlich auf — sonst waere die Regel oben leer bewiesen.
    const eigene = suche(MCP_QUELLEN, /https:\/\/mcp\.scalable\.capital/);
    expect(eigene.length).toBeGreaterThan(0);
  });

  it('macht die MCP-Adresse nicht ueber eine Umgebungsvariable konfigurierbar', () => {
    const treffer = suche(MCP_QUELLEN, /process\.env/);
    expect(treffer, `Umgebungsvariable im MCP-Client:\n${alsListe(treffer)}`).toEqual([]);
  });
});

describe('INV-01 — kein Shell-Umweg', () => {
  it('reicht nirgends `shell: true` an einen Kindprozess', () => {
    const treffer = sucheImCode(QUELLEN, /shell\s*:\s*(true|['"`])/);
    expect(treffer, `Shell-Umweg:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('holt aus node:child_process nur Funktionen mit Argument-Array', () => {
    // `exec` und `execSync` nehmen eine Kommandozeile und geben sie der Shell.
    // `execFile`, `spawn` und `fork` nehmen ein Array — dort kann kein Argument
    // zu einem zweiten Befehl werden, egal was darin steht.
    const MIT_ARRAY = new Set(['execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork']);
    const boese: string[] = [];

    for (const q of QUELLEN) {
      for (const zeile of q.inhalt.split('\n')) {
        const treffer = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]node:child_process['"]/.exec(zeile);
        if (treffer === null) continue;
        for (const roh of (treffer[1] ?? '').split(',')) {
          const name = roh.trim().split(/\s+as\s+/)[0]?.trim();
          if (name !== undefined && name !== '' && !MIT_ARRAY.has(name)) boese.push(`${q.pfad}: ${name}`);
        }
      }
    }

    expect(boese, `Shell-faehige Funktion importiert: ${boese.join(', ')}`).toEqual([]);
  });

  it('importiert child_process nur als benannte Namen, nie als Namensraum', () => {
    // `import * as cp` wuerde `cp.exec` erlauben, ohne dass die Regel oben es sieht.
    const treffer = suche(QUELLEN, /import\s+\*\s+as\s+\w+\s+from\s*['"]node:child_process['"]|require\s*\(\s*['"]child_process/);
    expect(treffer, `Namensraum-Import von child_process:\n${alsListe(treffer)}`).toEqual([]);
  });
});
