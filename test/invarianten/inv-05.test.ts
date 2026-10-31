/**
 * INV-05 — Kein Inline-CSS ausser in `<Balken>` und `<ChartRahmen>`.
 *
 * Zwei Ausnahmen, beide unvermeidlich: ein Balken braucht eine berechnete Breite, ein
 * Diagrammrahmen eine gemessene Hoehe. Alles andere gehoert in Tailwind-Klassen
 * — sonst stehen Abstaende und Farben an zwei Orten und driften auseinander.
 */

import { describe, expect, it } from 'vitest';
import { alsListe, dateien, sucheImCode } from './quellen.ts';

const OBERFLAECHE = dateien(['src']);
const AUSNAHMEN = new Set([
  'src/components/Balken.tsx',
  'src/components/ChartRahmen.tsx',
]);
const UEBRIGE = OBERFLAECHE.filter((q) => !AUSNAHMEN.has(q.pfad));

describe('INV-05 — kein Inline-CSS', () => {
  it('findet die Oberflaeche', () => {
    expect(OBERFLAECHE.length).toBeGreaterThan(20);
  });

  it('kennt alle Ausnahmen als echte Dateien', () => {
    for (const pfad of AUSNAHMEN) {
      expect(OBERFLAECHE.some((q) => q.pfad === pfad), `${pfad} fehlt`).toBe(true);
    }
  });

  it('setzt ausserhalb der Ausnahmen kein `style`', () => {
    const treffer = sucheImCode(UEBRIGE, /\bstyle\s*=\s*\{/);
    expect(treffer, `Inline-CSS:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('schreibt nirgends direkt in `element.style`', () => {
    const treffer = sucheImCode(
      OBERFLAECHE,
      /\.style\s*\.\s*\w+\s*=|\.style\s*\.\s*setProperty\s*\(|\.style\s*\.\s*cssText|Object\.assign\s*\(\s*[\w.]+\.style\b|setAttribute\s*\(\s*['"]style['"]/,
    );
    expect(treffer, `Stil am DOM vorbei:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('reicht `style` nicht als Objektschluessel durch (Spread in eine Komponente)', () => {
    // format.ts: `style` ist dort die Option von Intl.NumberFormat, kein CSS.
    const treffer = sucheImCode(UEBRIGE.filter((q) => q.pfad !== 'src/lib/format.ts'), /\bstyle\s*:/);
    expect(treffer, `style im Objekt:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('setzt keine Stil-Props der Chart-Bibliothek (contentStyle, wrapperStyle …)', () => {
    const treffer = sucheImCode(OBERFLAECHE, /\b[a-z]\w*Style\s*[=:]/);
    expect(treffer, `Stil-Prop:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('schleust kein CSS ueber `dangerouslySetInnerHTML` ein', () => {
    const treffer = sucheImCode(OBERFLAECHE, /<style|dangerouslySetInnerHTML/);
    expect(treffer, `Stil als HTML:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('haelt die Ausnahmen klein — sie duerfen `style`, aber nicht beliebig viel', () => {
    for (const pfad of AUSNAHMEN) {
      const datei = OBERFLAECHE.find((q) => q.pfad === pfad)!;
      const anzahl = sucheImCode([datei], /\bstyle\s*=\s*\{/).length;
      expect(anzahl, `${pfad} setzt ${anzahl} Mal style`).toBeLessThanOrEqual(3);
    }
  });
});
