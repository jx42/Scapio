/**
 * Jede abgeschaltete eslint-Regel nennt ihren Grund in derselben Zeile (`-- …`). Ohne Grund
 * weiss beim naechsten Umbau niemand, ob die Ausnahme noch gebraucht wird.
 */

import { describe, expect, it } from 'vitest';
import { AUSGELIEFERT, alsListe, dateien, suche } from './invarianten/quellen.ts';

describe('eslint-Ausnahmen', () => {
  it('nennen ihren Grund in der Zeile', () => {
    const treffer = suche(dateien([...AUSGELIEFERT, 'start', 'test']), /(\/\/|\/\*)\s*eslint-disable/).filter(
      (t) => !/eslint-disable(-next-line|-line)?\s+[\w@/-]+(,\s*[\w@/-]+)*\s+--\s+\S/.test(t.text),
    );
    expect(treffer, `eslint-disable ohne Grund:\n${alsListe(treffer)}`).toEqual([]);
  });
});
