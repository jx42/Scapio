/**
 * INV-10 — Aenderst du `core/`, erhoehe `KERN_VERSION`.
 *
 * `depot_tag` speichert zu jeder Zeile die Kernversion, mit der sie gerechnet wurde.
 * Steigt die Version, gilt jede gespeicherte Zeile als veraltet und die Historie wird
 * aus `raw_snapshot` neu aufgebaut. Ohne diesen Zwang stuende in der Datenbank eine
 * Mischung aus zwei Rechenstaenden, und niemand saehe es der Zahl an.
 *
 * Der Test vergleicht einen Abdruck ueber alle Quelldateien in `core/` mit dem, der in
 * `core/.abdruck.json` neben der Version hinterlegt ist. Beide muessen zusammenpassen.
 *
 * ## Wenn dieser Test fehlschlaegt
 *
 * Er sagt dir nicht, dass etwas kaputt ist — er sagt, dass du `core/` geaendert hast.
 * Zwei Schritte:
 *
 *   1. `KERN_VERSION` in `core/version.ts` um eins erhoehen.
 *   2. `npm run abdruck` — schreibt `core/.abdruck.json` neu.
 *
 * Nur den Abdruck neu zu schreiben, ohne die Version zu erhoehen, ist genau der
 * Fehler, den diese Regel verhindern soll.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KERN_VERSION } from '../../core/version.ts';
import { ABDRUCK_DATEI, abdruckVonCore } from '../../start/abdruck.ts';
import type { Abdruckdatei } from '../../start/abdruck.ts';
import { WURZEL, dateien } from './quellen.ts';

describe('INV-10 — Kernversion und Abdruck', () => {
  it('hat einen hinterlegten Abdruck', () => {
    expect(
      existsSync(ABDRUCK_DATEI),
      'core/.abdruck.json fehlt — `npm run abdruck` schreibt sie.',
    ).toBe(true);
  });

  it('stimmt mit dem hinterlegten Abdruck ueberein', () => {
    const hinterlegt = JSON.parse(readFileSync(ABDRUCK_DATEI, 'utf8')) as Abdruckdatei;

    expect(
      abdruckVonCore(),
      [
        'Der Rechenkern hat sich geaendert.',
        '',
        '  1. KERN_VERSION in core/version.ts um eins erhoehen',
        '  2. npm run abdruck',
        '',
        `  hinterlegt fuer Version ${hinterlegt.kernVersion}: ${hinterlegt.abdruck}`,
      ].join('\n'),
    ).toBe(hinterlegt.abdruck);

    expect(hinterlegt.kernVersion, 'Der Abdruck gehoert zu einer anderen Kernversion').toBe(KERN_VERSION);
  });

  it('haelt die Version als ganze Zahl ab eins', () => {
    expect(Number.isInteger(KERN_VERSION)).toBe(true);
    expect(KERN_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('erfasst jede Quelldatei des Kerns', () => {
    // Eine neue Datei in `core/` muss den Abdruck heben. Waere der Sammler auf eine
    // Liste festgelegt, koennte eine neue Datei unbemerkt danebenstehen.
    const erfasst = dateien(['core']).map((q) => q.pfad);
    expect(erfasst).toContain('core/xirr.ts');
    expect(erfasst).toContain('core/kalender.ts');
    expect(erfasst.length).toBeGreaterThanOrEqual(16);
  });

  it('aendert sich, sobald sich eine Zeile im Kern aendert', () => {
    // Ohne diesen Nachweis koennte der Abdruck eine Konstante sein, die nie widerspricht.
    const h = createHash('sha256');
    for (const q of dateien(['core']).filter((d) => d.pfad !== 'core/version.ts')) {
      const name = q.pfad.slice('core/'.length);
      h.update(name);
      h.update('\0');
      h.update(name === 'xirr.ts' ? `${q.inhalt}\n// eine Zeile mehr` : q.inhalt);
      h.update('\0');
    }
    const unveraendert = createHash('sha256');
    for (const q of dateien(['core']).filter((d) => d.pfad !== 'core/version.ts')) {
      const name = q.pfad.slice('core/'.length);
      unveraendert.update(name);
      unveraendert.update('\0');
      unveraendert.update(q.inhalt);
      unveraendert.update('\0');
    }

    // Ohne Aenderung derselbe Abdruck, mit Aenderung ein anderer: erst beides zusammen
    // zeigt, dass die Datei tatsaechlich in den Abdruck eingeht.
    expect(unveraendert.digest('hex')).toBe(abdruckVonCore());
    expect(h.digest('hex')).not.toBe(abdruckVonCore());
  });

  it('speichert die Kernversion zu jeder gerechneten Zeile', () => {
    // Der Zwang wirkt nur, wenn die Version auch mitgeschrieben wird.
    const schema = readFileSync(join(WURZEL, 'db', 'migrationen', '001-basis.sql'), 'utf8');
    expect(schema, 'depot_tag fuehrt keine kern_version').toMatch(/kern_version/);
  });
});
