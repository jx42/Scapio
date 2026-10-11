/** Die Oberflaeche zeigt den Code und verweist aufs Runbook (`de.laufhinweise.code`) — dort muss er stehen. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LAUF_FEHLER } from '../shared/laufFehler.ts';

const runbook = readFileSync(new URL('../docs/RUNBOOK.md', import.meta.url), 'utf8');

describe('LAUF_FEHLER', () => {
  it.each(LAUF_FEHLER)('%s hat einen Eintrag in docs/RUNBOOK.md', (code) => {
    expect(runbook).toContain(`\`${code}\``);
  });
});
