/**
 * INV-02 — Kein Geldbetrag als Fliesskommazahl. `bigint` in Cent, `parseFloat` verboten.
 *
 * Der Grund: `0.1 + 0.2 !== 0.3`, und ein Depot ist eine
 * lange Kette von Additionen. Ein einziger `parseFloat` auf einem Betrag reicht, damit
 * die Summe irgendwann um einen Cent danebenliegt — und dann stimmt keine Zahl mehr.
 */

import { describe, expect, it } from 'vitest';
import { zuCent, zuKursE6, zuMengeE8 } from '../../core/dezimal.ts';
import { AUSGELIEFERT, alsListe, dateien, suche } from './quellen.ts';

const QUELLEN = dateien(AUSGELIEFERT);

describe('INV-02 — Geld ist bigint', () => {
  it('kennt kein parseFloat im ausgelieferten Code', () => {
    const treffer = suche(QUELLEN, /\bparseFloat\s*\(/);
    expect(treffer, `parseFloat gefunden:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('kennt kein Number.parseFloat', () => {
    const treffer = suche(QUELLEN, /Number\s*\.\s*parseFloat/);
    expect(treffer, `Number.parseFloat gefunden:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('rundet Geld nirgends mit Fliesskomma', () => {
    // `Number(cent)` fuer ein Verhaeltnis ist erlaubt — ein Verhaeltnis IST eine
    // Fliesskommazahl. Verboten ist, aus einem Betrag ueber `number` wieder einen
    // Betrag zu machen: dort geht der Cent verloren. Gerundet wird nur in
    // `core/dezimal.ts`, mit `rundeAufCent`.
    const treffer = suche(QUELLEN, /[Cc]ent/).filter((t) =>
      /Math\s*\.\s*(round|floor|ceil)|\.toFixed\s*\(/.test(t.text),
    );
    expect(treffer, `Geld ueber Fliesskomma gerundet:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('rundet Cent an genau einer Stelle', () => {
    const rundend = QUELLEN.filter(
      (q) => q.pfad.startsWith('core/') && /function rundeAufCent/.test(q.inhalt),
    );
    expect(rundend.map((q) => q.pfad)).toEqual(['core/dezimal.ts']);
  });

  it('gibt Betraege als bigint aus, nie als number', () => {
    expect(typeof zuCent('378.05')).toBe('bigint');
    expect(typeof zuMengeE8('1.5')).toBe('bigint');
    expect(typeof zuKursE6('62.5')).toBe('bigint');
  });

  it('waescht auch eine hereingereichte Fliesskommazahl in Cent', () => {
    // 0.1 + 0.2 ist 0.30000000000000004 — als Cent sind es dreissig.
    expect(zuCent(0.1 + 0.2)).toBe(30n);
  });

  it('liefert die Bauanleitungszahl exakt, an der parseFloat scheitert', () => {
    expect(zuCent('10.671')).toBe(1067n);
  });

  it('gibt es ueberhaupt Quelldateien zu pruefen', () => {
    // Ohne diese Zeile waere der Test gruen, wenn der Sammler nichts faende.
    expect(QUELLEN.length).toBeGreaterThan(10);
  });
});
