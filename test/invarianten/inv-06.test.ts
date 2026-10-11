/**
 * INV-06 — Fremdtext wird nie als HTML gerendert und nie in ein `href` gesetzt.
 *
 * Wertpapiernamen, Beschreibungen und Fehlermeldungen kommen von der Bank und von
 * iShares. Ein Name wie `<img src=x onerror=alert(1)>` muss als dieser Text auf dem
 * Bildschirm stehen — und nicht als Bild, das nicht laedt.
 */

import { describe, expect, it } from 'vitest';
import { AUSGELIEFERT, alsListe, dateien, sucheImCode } from './quellen.ts';

const QUELLEN = dateien(AUSGELIEFERT);
const OBERFLAECHE = dateien(['src']);

describe('INV-06 — Fremdtext bleibt Text', () => {
  it('rendert nirgends HTML aus einer Zeichenkette', () => {
    const treffer = sucheImCode(QUELLEN, /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\s*\.\s*write/);
    expect(treffer, `Fremdtext als HTML:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('baut kein `href` aus einem Wert', () => {
    // Ein statisches `href="#inhalt"` ist in Ordnung. Ein `href={etwas}` nicht:
    // `javascript:` ist ein gueltiges Schema, und niemand prueft den Wert.
    const treffer = sucheImCode(OBERFLAECHE, /\bhref\s*=\s*\{/);
    expect(treffer, `href aus einem Wert:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('baut kein `src` aus einem Wert', () => {
    const treffer = sucheImCode(OBERFLAECHE, /\bsrc\s*=\s*\{/);
    expect(treffer, `src aus einem Wert:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('navigiert nicht programmatisch an eine berechnete Adresse', () => {
    const treffer = sucheImCode(OBERFLAECHE, /location\s*\.\s*(href|assign|replace)\s*[=(]|window\s*\.\s*open\s*\(/);
    expect(treffer, `Berechnete Navigation:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('wertet nichts aus, was wie Code aussieht', () => {
    const treffer = sucheImCode(QUELLEN, /\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*['"`]/);
    expect(treffer, `Ausgewerteter Text:\n${alsListe(treffer)}`).toEqual([]);
  });
});
