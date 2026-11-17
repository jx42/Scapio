/**
 * `npm run audit` — eine Ausnahme darf nur genau ihren Fund freistellen, und nur bis zu
 * ihrem Datum. [ADR-068]
 */

import { describe, expect, it } from 'vitest';
import { alsTag, type Tag } from '../../core/kalender.ts';
import { AUSNAHMEN, bewerte, ueberfluessig, type Ausnahme } from '../../start/audit.ts';

const AUSNAHME: Ausnahme = { advisory: 'GHSA-aaaa-bbbb-cccc', paket: 'paket-a', bis: '2027-01-31' as Tag };

function bericht(...advisories: { name: string; id: string; severity: string }[]) {
  const vulnerabilities: Record<string, { via: unknown[] }> = {};
  for (const a of advisories) {
    vulnerabilities[a.name] = {
      via: [{ name: a.name, url: `https://github.com/advisories/${a.id}`, severity: a.severity }],
    };
  }
  // Ein abhaengiges Paket verweist nur per Name — darf nicht doppelt zaehlen.
  vulnerabilities['abhaengig'] = { via: advisories.map((a) => a.name) };
  return { vulnerabilities };
}

describe('bewerte', () => {
  it('stellt einen Fund bis einschliesslich zum Ablaufdatum frei', () => {
    const b = bericht({ name: 'paket-a', id: AUSNAHME.advisory, severity: 'high' });
    const r = bewerte(b, [AUSNAHME], '2027-01-31' as Tag);
    expect(r.offen).toEqual([]);
    expect(r.getroffen.has(AUSNAHME)).toBe(true);
  });

  it('meldet den Fund nach Ablauf wieder als offen', () => {
    const b = bericht({ name: 'paket-a', id: AUSNAHME.advisory, severity: 'high' });
    expect(bewerte(b, [AUSNAHME], '2027-02-01' as Tag).offen).toEqual([`paket-a ${AUSNAHME.advisory}`]);
  });

  it('stellt nur dieselbe Advisory im selben Paket frei', () => {
    const b = bericht(
      { name: 'paket-b', id: AUSNAHME.advisory, severity: 'high' },
      { name: 'paket-a', id: 'GHSA-xxxx-yyyy-zzzz', severity: 'critical' },
    );
    expect(bewerte(b, [AUSNAHME], '2027-01-01' as Tag).offen).toHaveLength(2);
  });

  it('laesst moderate und low durch', () => {
    const b = bericht({ name: 'paket-c', id: 'GHSA-mmmm-mmmm-mmmm', severity: 'moderate' });
    expect(bewerte(b, [], '2027-01-01' as Tag).offen).toEqual([]);
  });

  it('wirft, wenn npm keinen Bericht liefert', () => {
    expect(() => bewerte({ error: { code: 'ENOTFOUND' } }, [], '2027-01-01' as Tag)).toThrow();
  });
});

describe('ueberfluessig', () => {
  it('nennt gueltige Ausnahmen ohne Treffer, abgelaufene nicht', () => {
    expect(ueberfluessig([AUSNAHME], new Set(), '2027-01-01' as Tag)).toEqual([`paket-a ${AUSNAHME.advisory}`]);
    expect(ueberfluessig([AUSNAHME], new Set(), '2027-02-01' as Tag)).toEqual([]);
  });
});

describe('AUSNAHMEN', () => {
  it('nennt je eine GHSA-ID und ein gueltiges Ablaufdatum', () => {
    for (const a of AUSNAHMEN) {
      expect(a.advisory).toMatch(/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
      expect(alsTag(a.bis)).toBe(a.bis);
    }
  });
});
