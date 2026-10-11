/**
 * `npm run verify` — der erste Griff, wenn eine Zahl falsch aussieht. [P-08]
 *
 * Rechnet die GESAMTE Historie noch einmal und vergleicht sie Tag fuer Tag mit dem, was
 * in `depot_tag` steht. Jede Abweichung wird mit Tag und Differenz genannt — keine
 * Zusammenfassung, keine Toleranz: bei Cent-Ganzzahlen ist eine Abweichung entweder
 * null oder ein Befund. [INV-02]
 *
 * Gerechnet wird auf einer KOPIE der Datenbank, angelegt ueber die SQLite-Backup-API.
 * `verify` darf die echten Daten unter keinen Umstaenden anfassen — ein Pruefwerkzeug,
 * das den Pruefling veraendert, prueft nichts.
 *
 * Der Exit-Code ist ungleich null, sobald es eine Abweichung gibt, damit `npm run check`
 * und jede Automatik das merken.
 *
 * `--nur-zaehlung` (`npm run verify:zaehlung`) nennt Tag und Feld, aber keinen Betrag: der
 * Weg fuer Agentensitzungen, deren Kontext bei einem Cloud-Dienst liegt [ADR-042].
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Cent } from '../core/dezimal.ts';
import { euroText } from '../core/dezimal.ts';
import type { Tag } from '../core/kalender.ts';
import { tagAus } from '../core/kalender.ts';
import { ladeKonfiguration } from '../shared/konfiguration.ts';
import { oeffneDatenbank, schemaVersion, sichern } from '../db/verbindung.ts';
import * as repository from '../db/repository/index.ts';

export type Abweichung = {
  readonly tag: string;
  readonly feld: string;
  readonly gespeichertCent: Cent;
  readonly neuCent: Cent;
};

/** Tag und Feld, keine Betraege — fuer `--nur-zaehlung`. */
export function zaehlungText(befunde: readonly Abweichung[]): string {
  const jeFeld = new Map<string, number>();
  for (const b of befunde) jeFeld.set(b.feld, (jeFeld.get(b.feld) ?? 0) + 1);
  const zeilen = [`${befunde.length} Abweichung(en)`, ''];
  for (const [feld, anzahl] of jeFeld) zeilen.push(`  ${feld.padEnd(26)}  ${String(anzahl)}`);
  zeilen.push('', 'Tag         Feld');
  for (const b of befunde) zeilen.push(`${b.tag}  ${b.feld}`);
  return `${zeilen.join('\n')}\n`;
}

export function vergleicheReihen(
  gespeichert: readonly { tag: Tag; wertpapiereCent: Cent; cashCent: Cent; gesamtCent: Cent; nettoEinzahlungKumCent: Cent }[],
  neu: readonly { tag: Tag; wertpapiereCent: Cent; cashCent: Cent; gesamtCent: Cent; nettoEinzahlungKumCent: Cent }[],
): Abweichung[] {
  const nachTag = new Map(neu.map((z) => [z.tag as string, z]));
  const befunde: Abweichung[] = [];

  for (const alt of gespeichert) {
    const frisch = nachTag.get(alt.tag);
    if (frisch === undefined) {
      befunde.push({ tag: alt.tag, feld: 'fehlt in der Neuberechnung', gespeichertCent: alt.gesamtCent, neuCent: 0n });
      continue;
    }
    nachTag.delete(alt.tag);

    const felder = ['wertpapiereCent', 'cashCent', 'gesamtCent', 'nettoEinzahlungKumCent'] as const;
    for (const feld of felder) {
      if (alt[feld] !== frisch[feld]) {
        befunde.push({ tag: alt.tag, feld, gespeichertCent: alt[feld], neuCent: frisch[feld] });
      }
    }
  }

  for (const [tag, frisch] of nachTag) {
    befunde.push({ tag, feld: 'fehlt in depot_tag', gespeichertCent: 0n, neuCent: frisch.gesamtCent });
  }

  return befunde.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}

export async function haupt(argumente: readonly string[] = process.argv.slice(2)): Promise<number> {
  const nurZaehlung = argumente.includes('--nur-zaehlung');
  const konfiguration = ladeKonfiguration();
  const echt = await oeffneDatenbank({ konfiguration, migrieren: false });
  const arbeitsverzeichnis = mkdtempSync(join(tmpdir(), 'portfolio-verify-'));

  try {
    const gespeichert = repository.depotTag.alle(echt);
    if (gespeichert.length === 0) {
      process.stdout.write('In depot_tag steht nichts — es gibt nichts zu vergleichen.\n');
      return 0;
    }

    process.stdout.write(`Lege eine Kopie der Datenbank an (${gespeichert.length} Tage) …\n`);
    const kopiePfad = await sichern(echt, arbeitsverzeichnis, schemaVersion(echt));

    const kopie = await oeffneDatenbank({ konfiguration, pfad: kopiePfad, migrieren: false });
    try {
      // Synchron — `berechneNeu` rechnet in EINER SQLite-Transaktion und darf deshalb
      // nicht unterbrochen werden.
      let berechneNeu: (db: DatabaseSync, heute: Tag, alles: boolean) => unknown;
      try {
        const modul = (await import('../ingest/neuberechnung.ts')) as unknown as {
          berechneNeu: typeof berechneNeu;
        };
        berechneNeu = modul.berechneNeu;
      } catch {
        process.stderr.write('ingest/neuberechnung.ts fehlt — verify kann nicht neu rechnen.\n');
        return 2;
      }

      const heute = tagAus(new Date().toISOString());
      berechneNeu(kopie, heute, true);

      const befunde = vergleicheReihen(gespeichert, repository.depotTag.alle(kopie));

      if (befunde.length === 0) {
        process.stdout.write(`Alle ${gespeichert.length} Tage stimmen ueberein.\n`);
        return 0;
      }

      if (nurZaehlung) {
        process.stdout.write(`\n${zaehlungText(befunde)}`);
        process.stdout.write('\nWas nun zu tun ist, steht in docs/RUNBOOK.md, Abschnitt "Zahlen sehen falsch aus".\n');
        return 1;
      }
      process.stdout.write(`\n${befunde.length} Abweichung(en):\n\n`);
      process.stdout.write('Tag         Feld                        gespeichert          neu          Differenz\n');
      for (const b of befunde) {
        const diff = b.neuCent - b.gespeichertCent;
        process.stdout.write(
          `${b.tag}  ${b.feld.padEnd(26)}  ${euroText(b.gespeichertCent).padStart(14)}  ${euroText(b.neuCent).padStart(14)}  ${euroText(diff).padStart(14)}\n`,
        );
      }
      process.stdout.write('\nWas nun zu tun ist, steht in docs/RUNBOOK.md, Abschnitt "Zahlen sehen falsch aus".\n');
      return 1;
    } finally {
      kopie.close();
    }
  } finally {
    echt.close();
    rmSync(arbeitsverzeichnis, { recursive: true, force: true });
  }
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  process.exitCode = await haupt();
}
