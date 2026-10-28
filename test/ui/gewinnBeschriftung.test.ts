/*
 * Beschriftung eines Knotens im Gewinn-Sankey: bei Platzmangel weicht erst der Anteil, dann der
 * Betrag, erst zuletzt wird der Name gekuerzt.
 */

import { describe, expect, it } from 'vitest';

import { de } from '@/i18n/de';
import { beschriftung, noetigeStufe, type BeschriftungEingabe } from '@/features/gewinnquellen/beschriftung';
import { GEWINN_NAME_MINDESTZEICHEN, gewinnBeschriftungZeichen } from '@/lib/chartmasse';
import { gekuerzt } from '@/lib/format';

const NAME = 'Invesco Physical Gold ETC';
const BETRAG = '↑ 435 €';
const ANTEIL = '10,4 %';
const MIT_ANTEIL = de.gewinnquellen.betragUndAnteil(BETRAG, ANTEIL);

function eingabe(zeichen: number, name = NAME): BeschriftungEingabe {
  return { name, betrag: BETRAG, anteil: ANTEIL, zeichen };
}

describe('noetigeStufe', () => {
  it('zeigt alles, wenn der Platz reicht', () => {
    expect(noetigeStufe(eingabe(60))).toBe(0);
  });

  it('laesst zuerst den Anteil weg, bevor der Name unter die Mindestlaenge faellt', () => {
    expect(noetigeStufe(eingabe(BETRAG.length + 1 + GEWINN_NAME_MINDESTZEICHEN))).toBe(1);
  });

  it('laesst auch den Betrag weg, statt den Namen weiter zu kuerzen', () => {
    expect(noetigeStufe(eingabe(GEWINN_NAME_MINDESTZEICHEN + 2))).toBe(2);
  });

  it('misst einen kurzen Namen an seiner eigenen Laenge, nicht an der Mindestlaenge', () => {
    expect(noetigeStufe(eingabe('Erträge'.length + MIT_ANTEIL.length + 1, 'Erträge'))).toBe(0);
  });

  it('zeigt ohne Anteil nur den Betrag', () => {
    expect(beschriftung({ ...eingabe(60), anteil: null }, true, 0).wert).toBe(BETRAG);
  });
});

describe('beschriftung', () => {
  it('kuerzt einzeilig den Namen auf den Platz, den der Wert der Stufe laesst', () => {
    const zeichen = 20;
    expect(beschriftung(eingabe(zeichen), true, 1)).toEqual({ name: gekuerzt(NAME, zeichen - BETRAG.length - 1), wert: BETRAG });
    expect(beschriftung(eingabe(zeichen), true, 2)).toEqual({ name: gekuerzt(NAME, zeichen), wert: null });
  });

  it('gibt zweizeilig dem Wert eine eigene Zeile, ohne Anteil, wenn er nicht passt', () => {
    const zeichen = MIT_ANTEIL.length - 1;
    expect(beschriftung(eingabe(zeichen), false, 2)).toEqual({ name: gekuerzt(NAME, zeichen), wert: BETRAG });
  });
});

describe('gewinnBeschriftungZeichen', () => {
  it('gibt nie weniger als die Mindestlaenge eines Namens', () => {
    expect(gewinnBeschriftungZeichen(0)).toBe(GEWINN_NAME_MINDESTZEICHEN);
  });

  it('waechst mit der Breite', () => {
    expect(gewinnBeschriftungZeichen(1200)).toBeGreaterThan(gewinnBeschriftungZeichen(375));
  });
});

describe('gekuerzt', () => {
  it('laesst kurze Texte unveraendert', () => {
    expect(gekuerzt('Gold', 8)).toBe('Gold');
  });

  it('kuerzt mit Auslassungspunkten auf hoechstens die Zeichenzahl', () => {
    const k = gekuerzt(NAME, 8);
    expect(k.endsWith('…')).toBe(true);
    expect(k.length).toBeLessThanOrEqual(8);
  });
});
