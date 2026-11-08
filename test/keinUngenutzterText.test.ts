/**
 * Jeder Blattschluessel von `de` wird in `src/` gelesen. Ein toter Text faellt sonst nie auf:
 * TypeScript meldet keinen ungenutzten Objektschluessel, und beim naechsten Umformulieren
 * pflegt man ihn mit.
 *
 * Gesucht wird der volle Pfad (`de.verlauf.titel`), nach Aufloesen von Aliassen
 * (`const t = de.verlauf.jahre`, `const { auf } = de.…`). Ein Funktionsschluessel ist ein Blatt
 * wie ein Text; sein Aufruf `de.satz.beschriftung(…)` zaehlt als Zugriff.
 */

import { describe, expect, it } from 'vitest';
import { de } from '../src/i18n/de.ts';
import { dateien, type Quelldatei } from './invarianten/quellen.ts';

/** Teilbaeume, die nur per Index gelesen werden (`de.x[schluessel]`), und woher der Schluessel kommt. */
const DYNAMISCH: Readonly<Record<string, string>> = {
  'de.aktualisieren.schritte': 'Schritt des laufenden Laufs',
  'de.laufFehler': 'Fehlercode des Laufs',
  'de.laufhinweise.artTitel': 'Hinweisart aus dem Lauf',
  'de.laufhinweise.artTun': 'Hinweisart aus dem Lauf',
  'de.laufhinweise.quelle': 'Quellenart des Laufs',
  'de.laufhinweise.quelleCode': 'Fehlercode der Quellenmeldung',
  'de.mcpAnmeldung.fehler': 'Fehlercode der Anmeldung',
  'de.xirr': 'Grund aus dem Vertrag, warum kein XIRR',
  'de.verlauf.zeitraeume': 'gewaehlter Zeitraum',
  'de.verlauf.zeitraumLang': 'gewaehlter Zeitraum',
  'de.verlauf.markenTyp': 'Art der Marke',
  'de.verlauf.tabelleAufloesung': 'Aufloesung der Tabellenalternative',
  'de.kennzahlen.ertragsTyp': 'Ertragsart der Bank',
  'de.kennzahlen.hinweis': 'Hinweiscode der Kennzahlen',
  'de.fluesse.fensterKurz': 'gewaehltes Fenster',
  'de.fluesse.fensterLang': 'gewaehltes Fenster',
  'de.top25.anbieterName': 'Fondsanbieter',
  'de.frequenz': 'Sparplanfrequenz der Bank',
};

const BEZEICHNER = '[A-Za-z_$][\\w$]*';
const PFAD = `de(?:\\.${BEZEICHNER})*`;

type Baum = { readonly [schluessel: string]: unknown };

function istBaum(wert: unknown): wert is Baum {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

function blaetter(baum: Baum, pfad: string): string[] {
  return Object.entries(baum).flatMap(([k, v]) => (istBaum(v) ? blaetter(v, `${pfad}.${k}`) : [`${pfad}.${k}`]));
}

function knoten(pfad: string): unknown {
  return pfad
    .split('.')
    .slice(1)
    .reduce<unknown>((wert, k) => (istBaum(wert) ? wert[k] : undefined), de);
}

const escape = (s: string): string => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

/** Quelltext ohne reine Kommentarzeilen, Ketten in einer Zeile, Aliasse durch ihren Pfad ersetzt. */
function aufgeloest(q: Quelldatei): string {
  let text = q.inhalt
    .split('\n')
    .filter((z) => !/^\s*(\/\/|\/\*|\*)/.test(z))
    .join('\n')
    .replace(/\?\.\[/g, '[')
    .replace(/\?\.(?=[A-Za-z_$])/g, '.')
    .replace(/\s+\.(?=[A-Za-z_$])/g, '.');
  const ersetze = (name: string, pfad: string): void => {
    text = text.replace(new RegExp(`(?<![\\w$.])${escape(name)}(?=[.[])`, 'g'), pfad);
  };
  for (const [, name, pfad] of text.matchAll(
    new RegExp(`\\b(?:const|let)\\s+(${BEZEICHNER})\\s*(?::[^;]+?)?=\\s*(${PFAD})\\s*;`, 'g'),
  )) {
    ersetze(name!, pfad!);
  }
  for (const [, liste, pfad] of text.matchAll(
    new RegExp(`\\b(?:const|let)\\s*\\{([^}]*)\\}\\s*(?::[^;]+?)?=\\s*(${PFAD})\\s*;`, 'g'),
  )) {
    for (const eintrag of liste!.split(',').map((e) => e.trim()).filter(Boolean)) {
      const [schluessel, name = schluessel] = eintrag.split(':').map((e) => e.trim());
      text += `\n${pfad}.${schluessel}\n`;
      ersetze(name!, `${pfad}.${schluessel}`);
    }
  }
  return text;
}

const QUELLTEXT = dateien(['src']).map(aufgeloest).join('\n');

describe('kein ungenutzter Text in i18n/de.ts', () => {
  it('jeder Blattschluessel wird gelesen', () => {
    const ungenutzt = blaetter(de, 'de').filter(
      (pfad) =>
        !Object.keys(DYNAMISCH).some((d) => pfad.startsWith(`${d}.`)) &&
        !new RegExp(`${escape(pfad)}(?![\\w$])`).test(QUELLTEXT),
    );
    expect(ungenutzt, 'in src/ nirgends gelesen — loeschen oder in DYNAMISCH begruenden').toEqual([]);
  });

  it('jede Ausnahme ist ein Teilbaum von de und wird noch per Index gelesen', () => {
    const veraltet = Object.keys(DYNAMISCH).filter(
      (pfad) => !istBaum(knoten(pfad)) || !new RegExp(`${escape(pfad)}\\[`).test(QUELLTEXT),
    );
    expect(veraltet).toEqual([]);
  });
});
